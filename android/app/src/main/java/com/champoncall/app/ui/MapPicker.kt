package com.champoncall.app.ui

import android.content.Context
import android.location.Geocoder
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.champoncall.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import java.io.File
import java.util.Locale

/** Centre of Gurugram, where the map opens when we don't know the customer's location yet. */
val GURUGRAM = GeoPoint(28.4595, 77.0266)

private fun setUpMaps(context: Context) {
    val c = Configuration.getInstance()
    c.userAgentValue = context.packageName
    c.osmdroidBasePath = File(context.filesDir, "osmdroid")
    c.osmdroidTileCache = File(context.cacheDir, "osmdroid-tiles")
}

/** Full-screen map: the customer moves the map under the pin and confirms the pickup point. */
@Composable
fun MapPicker(startLat: Double?, startLng: Double?, onDismiss: () -> Unit, onPicked: (lat: Double, lng: Double, address: String?) -> Unit) {
    val context = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var busy by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }
    val map = remember {
        setUpMaps(context)
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            isTilesScaledToDpi = true
            minZoomLevel = 5.0
            maxZoomLevel = 19.5
            controller.setZoom(if (startLat != null) 17.0 else 13.0)
            controller.setCenter(if (startLat != null && startLng != null) GeoPoint(startLat, startLng) else GURUGRAM)
        }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) map.onResume()
            if (e == Lifecycle.Event.ON_PAUSE) map.onPause()
        }
        lifecycle.addObserver(observer)
        map.onResume()
        onDispose {
            lifecycle.removeObserver(observer)
            map.onPause()
            map.onDetach()
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Brand.Warm50).testTag("map-picker")) {
            AndroidView(factory = { map }, modifier = Modifier.fillMaxSize().testTag("map"))

            // Pin fixed in the middle of the map; its point marks the chosen place
            Box(Modifier.align(Alignment.Center).offset(y = (-22).dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(46.dp).shadow(6.dp, CircleShape).clip(CircleShape).background(Brand.B800), contentAlignment = Alignment.Center) {
                    Ic(R.drawable.fi_map_pin, tint = Brand.Gold400, size = 24.dp)
                }
            }
            Box(Modifier.align(Alignment.Center).size(8.dp).clip(CircleShape).background(Brand.Gold500))

            Surface(
                color = Color.White,
                shadowElevation = 4.dp,
                modifier = Modifier.fillMaxWidth().align(Alignment.TopCenter),
            ) {
                Row(Modifier.statusBarsPadding().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.IconButton(onClick = onDismiss, modifier = Modifier.testTag("map-back")) {
                        Ic(R.drawable.fi_arrow_left, tint = Brand.Ink, size = 22.dp, desc = "Back")
                    }
                    Column {
                        Text("Choose pickup on map", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("Move the map so the pin sits on the pickup point", fontSize = 12.sp, color = Brand.Slate500)
                    }
                }
            }

            Column(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppButton(
                    if (locating) "Finding your location…" else "Use my location",
                    {
                        locating = true
                        currentLocation(context) { loc ->
                            locating = false
                            if (loc == null) toast("Could not get your location. Move the map instead.")
                            else {
                                map.controller.setZoom(17.5)
                                map.controller.animateTo(GeoPoint(loc.latitude, loc.longitude))
                            }
                        }
                    },
                    Modifier.fillMaxWidth(), BtnKind.Secondary, icon = R.drawable.fi_navigation, enabled = !locating,
                )
                AppButton(
                    "Confirm pickup location",
                    {
                        val c = map.mapCenter
                        busy = true
                        scope.launch {
                            val address = withContext(Dispatchers.IO) { reverseGeocode(context, c.latitude, c.longitude) }
                            busy = false
                            onPicked(c.latitude, c.longitude, address)
                        }
                    },
                    Modifier.fillMaxWidth().testTag("map-confirm"), BtnKind.Primary, icon = R.drawable.fi_check, large = true, loading = busy,
                )
                Spacer(Modifier.height(2.dp))
                Text("Map data © OpenStreetMap contributors", fontSize = 10.sp, color = Brand.Slate500, modifier = Modifier.align(Alignment.End))
            }
        }
    }
}

/** Street address for a point, using the phone's built-in geocoder when it has one. */
@Suppress("DEPRECATION")
fun reverseGeocode(context: Context, lat: Double, lng: Double): String? = runCatching {
    if (!Geocoder.isPresent()) return@runCatching null
    Geocoder(context, Locale("en", "IN")).getFromLocation(lat, lng, 1)?.firstOrNull()?.let { a ->
        (0..a.maxAddressLineIndex).mapNotNull { a.getAddressLine(it) }.joinToString(", ").ifBlank { null }
    }
}.getOrNull()
