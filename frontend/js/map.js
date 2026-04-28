// Map functionality for parcel tracking
let trackingPolyline = null;
let markers = {};
let marker; // Keeping this for backward compatibility if needed in other places

function clearTrackingPolyline() {
    if (trackingPolyline) {
        map.removeLayer(trackingPolyline);
        trackingPolyline = null;
    }
}

function hasValidCoordinates(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng);
}

// Initialize the map
function initMap() {
    // Default center (can be changed to a specific location)
    const defaultLat = 40.7128;
    const defaultLng = -74.0060;

    map = L.map('map').setView([defaultLat, defaultLng], 10);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Update map marker position
function updateMapMarker(parcelId, lat, lng, options = {}) {
    if (markers[parcelId]) {
        markers[parcelId].setLatLng([lat, lng]);
    } else {
        markers[parcelId] = L.marker([lat, lng]).addTo(map);
    }
    map.setView([lat, lng], 15);
    const { locationName, destinationName } = options || {};
    const safeLocation = locationName ? String(locationName) : null;
    const safeDestination = destinationName ? String(destinationName) : null;
    const parts = [];
    parts.push(`<strong>Parcel Location (${parcelId})</strong>`);
    if (safeLocation) parts.push(`Place: ${safeLocation}`);
    if (safeDestination) parts.push(`Destination: ${safeDestination}`);
    parts.push(`Lat: ${lat.toFixed(6)}`);
    parts.push(`Lng: ${lng.toFixed(6)}`);
    markers[parcelId].bindPopup(parts.join('<br>')).openPopup();
}

// Track parcel function
async function trackParcel() {
    const parcelId = document.getElementById('parcelIdInput').value.trim();

    if (!parcelId) {
        showMessage('Please enter a parcel ID', 'warning');
        return;
    }

    try {
        // Get parcel information
        const parcelResponse = await fetch(`${API_BASE_URL}/parcels`);
        const parcels = await parcelResponse.json();
        const parcel = parcels.find(p => p.parcelId === parcelId);

        if (!parcel) {
            showMessage('Parcel not found', 'danger');
            return;
        }

        // Display parcel information
        document.getElementById('infoParcelId').textContent = parcel.parcelId;
        document.getElementById('infoStatus').textContent = parcel.status;
        document.getElementById('infoStatus').className = `badge status-${parcel.status.toLowerCase().replace(' ', '-')}`;
        document.getElementById('infoSender').textContent = parcel.senderName;
        document.getElementById('infoReceiver').textContent = parcel.receiverName;
        document.getElementById('infoDriver').textContent = parcel.driverId || 'Not assigned';
        const destination = parcel.deliveryAddress || '';
        currentDestinationName = destination;
        const destinationEl = document.getElementById('infoDestination');
        if (destinationEl) destinationEl.textContent = destination || 'N/A';

        document.getElementById('parcelInfo').style.display = 'block';
        currentParcelStatus = parcel.status;
        clearTrackingPolyline();

        // Always set the current parcel ID so socket events work
        currentParcelId = parcelId;
        currentDriverId = parcel.driverId || null;

        // Allow manual location updates only when parcel is in transit (for Admin/Driver)
        const locControls = document.getElementById('locationControls');
        if (locControls) {
            if (parcel.driverId && parcel.status === 'In Transit') {
                locControls.style.display = 'block';
            } else {
                locControls.style.display = 'none';
            }
        }

        // Get tracking data
        const trackingResponse = await fetch(`${API_BASE_URL}/parcels/tracking/${parcelId}`);
        const trackingData = await trackingResponse.json();

        if (trackingData.length > 0) {
            // Show the latest location
            const latestLocation = trackingData[0]; // Already sorted by timestamp desc
            updateMapMarker(parcelId, latestLocation.latitude, latestLocation.longitude, {
                locationName: latestLocation.locationName,
                destinationName: currentDestinationName
            });

            if (parcel.status === 'Delivered') {
                if (markers[parcelId]) markers[parcelId].bindPopup('Parcel Delivered ✔<br>Final Location Reached').openPopup();
                showMessage('Parcel Delivered ✔ Final Location Reached', 'success');
            }

            // Show tracking history as a polyline
            const latlngs = trackingData.map(t => [t.latitude, t.longitude]);
            if (latlngs.length > 1) {
                trackingPolyline = L.polyline(latlngs, { color: 'blue', weight: 3, opacity: 0.7 }).addTo(map);
            }
        } else {
            // Consistent location resolution for all statuses:
            // 1) latest tracking point (handled above),
            // 2) assigned driver current coordinates,
            // 3) fallback if neither exists.
            let initialLat = null;
            let initialLng = null;
            if (parcel.driverId) {
                const driversResponse = await fetch(`${API_BASE_URL}/drivers`);
                const drivers = await driversResponse.json();
                const assignedDriver = drivers.find(d => d.driverId === parcel.driverId);
                const driverLat = assignedDriver ? Number(assignedDriver.latitude) : NaN;
                const driverLng = assignedDriver ? Number(assignedDriver.longitude) : NaN;
                if (hasValidCoordinates(driverLat, driverLng)) {
                    initialLat = driverLat;
                    initialLng = driverLng;
                }
            }

            if (hasValidCoordinates(initialLat, initialLng)) {
                updateMapMarker(parcelId, initialLat, initialLng, { destinationName: currentDestinationName });
            } else {
                map.setView([40.7128, -74.0060], 10);
                if (!markers[parcelId]) markers[parcelId] = L.marker([40.7128, -74.0060]).addTo(map);
                else markers[parcelId].setLatLng([40.7128, -74.0060]);
            }

            if (parcel.status === 'Delivered') {
                if (markers[parcelId]) markers[parcelId].bindPopup('Parcel Delivered ✔<br>Final Location Reached').openPopup();
                showMessage('Parcel Delivered ✔ Final Location Reached', 'success');
            } else if (hasValidCoordinates(initialLat, initialLng)) {
                if (markers[parcelId]) markers[parcelId].bindPopup('Showing assigned driver current location as initial position').openPopup();
            } else if (parcel.driverId) {
                if (markers[parcelId]) markers[parcelId].bindPopup('No tracking data available and driver has no current coordinates yet.').openPopup();
            } else {
                if (markers[parcelId]) markers[parcelId].bindPopup(`No tracking data and no assigned driver.<br>Pickup: ${parcel.pickupAddress}`).openPopup();
            }
        }

    } catch (error) {
        console.error('Error tracking parcel:', error);
        showMessage('Error tracking parcel', 'danger');
    }
}

// Update location (for demo purposes)
async function updateLocation() {
    const location = document.getElementById('locationInput').value.trim();

    if (!location) {
        showMessage('Please enter a valid location name', 'warning');
        return;
    }

    if (!currentParcelId || !currentDriverId) {
        if (currentParcelStatus === 'Delivered') {
            showMessage('Parcel Delivered ✔ Final Location Reached', 'success');
        } else if (currentParcelStatus !== 'In Transit') {
            showMessage('Location updates are allowed only when parcel status is In Transit', 'warning');
        } else {
            showMessage('No parcel selected for tracking', 'warning');
        }
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/parcels/update-location`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parcelId: currentParcelId,
                driverId: currentDriverId,
                location
            })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Location updated successfully!', 'success');
            // Update map immediately, even if socket event is delayed.
            updateMapMarker(currentParcelId, result.tracking.latitude, result.tracking.longitude, {
                locationName: result.tracking.locationName || result.resolvedLocation?.query,
                destinationName: currentDestinationName
            });
        } else {
            showMessage(result.message || 'Error updating location', 'danger');
        }
    } catch (error) {
        console.error('Error updating location:', error);
        showMessage('Error updating location', 'danger');
    }
}