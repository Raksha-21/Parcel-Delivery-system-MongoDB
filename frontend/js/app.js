// API base URL - change this to your backend URL when deployed
const API_BASE_URL = 'https://logitrack-backend-itj1.onrender.com/api';

// Global variables
let socket;
let currentParcelId = null;
let currentDriverId = null;
let currentParcelStatus = null;
let currentDestinationName = null;
let map;

// Initialize Socket.io connection
function initSocket() {
    socket = io('https://logitrack-backend-itj1.onrender.com');

    socket.on('connect', function() {
        console.log('Connected to server');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
    });

    // Listen for real-time location updates
    socket.on('locationUpdated', function(data) {
        console.log('Location update received:', data);
        
        // If we are tracking a specific parcel (Customer/Admin specific view)
        if (currentParcelId === data.parcelId && currentParcelStatus !== 'Delivered') {
            updateMapMarker(data.parcelId, data.latitude, data.longitude, {
                locationName: data.locationName,
                destinationName: currentDestinationName
            });
        } 
        // If Admin is viewing all parcels on a map (if applicable)
        else if (!currentParcelId && typeof updateMapMarker === 'function') {
            updateMapMarker(data.parcelId, data.latitude, data.longitude, {
                locationName: data.locationName
            });
        }
    });
}

// Dashboard functions
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE_URL}/parcels`);
        const parcels = await response.json();

        // Calculate statistics
        const total = parcels.length;
        const pending = parcels.filter(p => p.status === 'Pending').length;
        const inTransit = parcels.filter(p => p.status === 'In Transit').length;
        const delivered = parcels.filter(p => p.status === 'Delivered').length;

        // Update dashboard
        document.getElementById('totalParcels').textContent = total;
        document.getElementById('pendingParcels').textContent = pending;
        document.getElementById('inTransitParcels').textContent = inTransit;
        document.getElementById('deliveredParcels').textContent = delivered;

        // Show recent parcels
        const recentParcelsDiv = document.getElementById('recentParcels');
        const recentParcels = parcels.slice(0, 5);
        recentParcelsDiv.innerHTML = recentParcels.map(parcel => `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                    <strong>${parcel.parcelId}</strong> - ${parcel.senderName} → ${parcel.receiverName}
                </div>
                <span class="badge status-${parcel.status.toLowerCase().replace(' ', '-')}">${parcel.status}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showMessage('Error loading dashboard data', 'danger');
    }
}

// Add parcel function
async function addParcel() {
    const parcelData = {
        parcelId: document.getElementById('parcelId').value,
        senderName: document.getElementById('senderName').value,
        receiverName: document.getElementById('receiverName').value,
        pickupAddress: document.getElementById('pickupAddress').value,
        deliveryAddress: document.getElementById('deliveryAddress').value,
        weight: parseFloat(document.getElementById('weight').value)
    };

    try {
        const response = await fetch(`${API_BASE_URL}/parcels/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(parcelData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Parcel added successfully!', 'success');
            document.getElementById('addParcelForm').reset();
        } else {
            showMessage(result.message || 'Error adding parcel', 'danger');
        }
    } catch (error) {
        console.error('Error adding parcel:', error);
        showMessage('Error adding parcel', 'danger');
    }
}

// Global variable to hold loaded parcels for filtering
let currentLoadedParcels = [];
let activeParcelTab = 'active';

function switchParcelTab(tabName) {
    activeParcelTab = tabName;
    renderParcelsTable();
}

function renderParcelsTable() {
    const tableBody = document.getElementById('parcelsTableBody');
    if (!tableBody) return;

    let filteredParcels = [];
    if (activeParcelTab === 'active') {
        filteredParcels = currentLoadedParcels.filter(p => p.status !== 'Requested');
    } else {
        filteredParcels = currentLoadedParcels.filter(p => p.status === 'Requested');
    }

    if (filteredParcels.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-4">No parcels found in this section.</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredParcels.map(parcel => {
        const isRequested = parcel.status === 'Requested';
        
        // Setup custom button based on request status
        const actionButtons = isRequested ? `
            <button class="btn btn-sm btn-success d-flex align-items-center gap-1 shadow-sm px-3" onclick="openAssignDriverModal('${parcel.parcelId}')" style="background-color: #10B981; border-color: #10B981;">
                ✅ Approve & Assign
            </button>
        ` : `
            <div class="btn-group shadow-sm" role="group">
                <button class="btn btn-sm btn-primary d-flex align-items-center gap-1" onclick="openAssignDriverModal('${parcel.parcelId}')">
                    👤 Assign Driver
                </button>
                <button class="btn btn-sm btn-info text-white d-flex align-items-center gap-1" onclick="openUpdateStatusModal('${parcel.parcelId}')" style="background-color: #0EA5E9; border-color: #0EA5E9;">
                    🔄 Update Status
                </button>
            </div>
        `;

        return `
            <tr>
                <td><strong>${parcel.parcelId}</strong></td>
                <td>${parcel.senderName}</td>
                <td>${parcel.receiverName}</td>
                <td>${parcel.pickupAddress}</td>
                <td>${parcel.deliveryAddress}</td>
                <td>${parcel.weight}</td>
                <td><span class="badge status-${parcel.status.toLowerCase().replace(' ', '-')}">${parcel.status}</span></td>
                <td>${parcel.driverId || '<em>Not assigned</em>'}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join('');
}

// Load parcels for parcel list page
async function loadParcels() {
    try {
        const response = await fetch(`${API_BASE_URL}/parcels`);
        currentLoadedParcels = await response.json();

        // Update the requests count badge on the navigation tab
        const requests = currentLoadedParcels.filter(p => p.status === 'Requested');
        const badge = document.getElementById('requestBadge');
        if (badge) {
            if (requests.length > 0) {
                badge.textContent = requests.length;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }

        renderParcelsTable();
    } catch (error) {
        console.error('Error loading parcels:', error);
        const tableBody = document.getElementById('parcelsTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading parcels</td></tr>';
        }
    }
}

// Load drivers for modal
async function loadDriversForModal() {
    try {
        const response = await fetch(`${API_BASE_URL}/drivers`);
        const drivers = await response.json();

        const driverSelect = document.getElementById('driverSelect');
        driverSelect.innerHTML = '<option value="">Choose a driver...</option>' +
            drivers.map(driver => `<option value="${driver.driverId}">${driver.name} (${driver.driverId})</option>`).join('');

    } catch (error) {
        console.error('Error loading drivers:', error);
    }
}

// Open assign driver modal
function openAssignDriverModal(parcelId) {
    document.getElementById('assignParcelId').value = parcelId;
    const modal = new bootstrap.Modal(document.getElementById('assignDriverModal'));
    modal.show();
}

// Assign driver to parcel
async function assignDriver() {
    const parcelId = document.getElementById('assignParcelId').value;
    const driverId = document.getElementById('driverSelect').value;

    if (!driverId) {
        showMessage('Please select a driver', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/parcels/assign-driver/${parcelId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ driverId })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Driver assigned successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('assignDriverModal')).hide();
            loadParcels();
        } else {
            showMessage(result.message || 'Error assigning driver', 'danger');
        }
    } catch (error) {
        console.error('Error assigning driver:', error);
        showMessage('Error assigning driver', 'danger');
    }
}

// Open update status modal
function openUpdateStatusModal(parcelId) {
    document.getElementById('updateParcelId').value = parcelId;
    const modal = new bootstrap.Modal(document.getElementById('updateStatusModal'));
    modal.show();
}

// Update parcel status
async function updateStatus() {
    const parcelId = document.getElementById('updateParcelId').value;
    const status = document.getElementById('statusSelect').value;

    try {
        const response = await fetch(`${API_BASE_URL}/parcels/update-status/${parcelId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Status updated successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('updateStatusModal')).hide();
            loadParcels();
        } else {
            showMessage(result.message || 'Error updating status', 'danger');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showMessage('Error updating status', 'danger');
    }
}

// Driver management functions
async function loadDrivers() {
    try {
        const response = await fetch(`${API_BASE_URL}/drivers`);
        const drivers = await response.json();

        const tableBody = document.getElementById('driversTableBody');
        tableBody.innerHTML = drivers.map(driver => `
            <tr>
                <td>${driver.driverId}</td>
                <td>${driver.name}</td>
                <td>${driver.phone}</td>
                <td>${driver.vehicleNumber}</td>
                <td>${driver.routeId || 'Not assigned'}</td>
                <td>${driver.locationName || 'N/A'}</td>
                <td>${driver.latitude ?? 'N/A'}</td>
                <td>${driver.longitude ?? 'N/A'}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary rounded-pill px-3 d-flex align-items-center gap-1" onclick="openEditDriverModal('${driver.driverId}')">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill px-3 d-flex align-items-center gap-1" onclick="deleteDriver('${driver.driverId}')">
                            🗑️ Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading drivers:', error);
        document.getElementById('driversTableBody').innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading drivers</td></tr>';
    }
}

// Add driver
async function addDriver() {
    const driverData = {
        driverId: document.getElementById('driverId').value,
        name: document.getElementById('driverName').value,
        phone: document.getElementById('driverPhone').value,
        vehicleNumber: document.getElementById('vehicleNumber').value,
        routeId: document.getElementById('routeId').value || null,
        locationName: document.getElementById('driverLocationName')?.value
    };

    if (!driverData.locationName || !driverData.locationName.trim()) {
        showMessage('Please provide a valid place name for the driver location', 'warning');
        return;
    }

    // Geocode on frontend to bypass Render server IP block
    try {
        const encoded = encodeURIComponent(driverData.locationName.trim());
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`, {
            headers: { 'User-Agent': 'LogiTrack/1.0 (learning-project)' }
        });
        if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData && geoData.length > 0) {
                driverData.latitude = parseFloat(geoData[0].lat);
                driverData.longitude = parseFloat(geoData[0].lon);
            }
        }
    } catch (e) {
        console.warn('Frontend geocoding failed, falling back to backend:', e);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/drivers/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(driverData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Driver added successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('addDriverModal')).hide();
            document.getElementById('addDriverForm').reset();
            loadDrivers();
        } else {
            showMessage(result.message || 'Error adding driver', 'danger');
        }
    } catch (error) {
        console.error('Error adding driver:', error);
        showMessage('Error adding driver', 'danger');
    }
}

// Open edit driver modal
async function openEditDriverModal(driverId) {
    try {
        const response = await fetch(`${API_BASE_URL}/drivers`);
        const drivers = await response.json();
        const driver = drivers.find(d => d.driverId === driverId);

        if (driver) {
            document.getElementById('editDriverId').value = driver.driverId;
            document.getElementById('editDriverName').value = driver.name;
            document.getElementById('editDriverPhone').value = driver.phone;
            document.getElementById('editVehicleNumber').value = driver.vehicleNumber;
            document.getElementById('editRouteId').value = driver.routeId || '';
            document.getElementById('editDriverLocationName').value = driver.locationName || '';

            const modal = new bootstrap.Modal(document.getElementById('editDriverModal'));
            modal.show();
        }
    } catch (error) {
        console.error('Error loading driver details:', error);
    }
}

// Update driver
async function updateDriver() {
    const driverId = document.getElementById('editDriverId').value;
    const driverData = {
        name: document.getElementById('editDriverName').value,
        phone: document.getElementById('editDriverPhone').value,
        vehicleNumber: document.getElementById('editVehicleNumber').value,
        routeId: document.getElementById('editRouteId').value || null,
        locationName: document.getElementById('editDriverLocationName')?.value
    };

    if (!driverData.locationName || !driverData.locationName.trim()) {
        showMessage('Please provide a valid place name for the driver location', 'warning');
        return;
    }

    // Geocode on frontend to bypass Render server IP block
    try {
        const encoded = encodeURIComponent(driverData.locationName.trim());
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`, {
            headers: { 'User-Agent': 'LogiTrack/1.0 (learning-project)' }
        });
        if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData && geoData.length > 0) {
                driverData.latitude = parseFloat(geoData[0].lat);
                driverData.longitude = parseFloat(geoData[0].lon);
            }
        }
    } catch (e) {
        console.warn('Frontend geocoding failed, falling back to backend:', e);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/drivers/${driverId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(driverData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Driver updated successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editDriverModal')).hide();
            loadDrivers();
        } else {
            showMessage(result.message || 'Error updating driver', 'danger');
        }
    } catch (error) {
        console.error('Error updating driver:', error);
        showMessage('Error updating driver', 'danger');
    }
}

// Delete driver
async function deleteDriver(driverId) {
    if (!confirm('Are you sure you want to delete this driver?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/drivers/${driverId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showMessage('Driver deleted successfully!', 'success');
            loadDrivers();
        } else {
            const result = await response.json();
            showMessage(result.message || 'Error deleting driver', 'danger');
        }
    } catch (error) {
        console.error('Error deleting driver:', error);
        showMessage('Error deleting driver', 'danger');
    }
}

// Utility function to show messages
function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.className = `alert alert-${type} alert-dismissible fade show`;
        messageDiv.setAttribute('role', 'alert');
        messageDiv.innerHTML = `
            <div>${String(message)}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        messageDiv.classList.remove('d-none');

        // Hide message after 5 seconds
        setTimeout(() => {
            try {
                const alertInstance = bootstrap.Alert.getOrCreateInstance(messageDiv);
                alertInstance.close();
            } catch {
                messageDiv.classList.add('d-none');
                messageDiv.innerHTML = '';
            }
        }, 5000);
    } else {
        // For pages without #message, show a floating in-page alert.
        let floatingContainer = document.getElementById('floating-message-container');
        if (!floatingContainer) {
            floatingContainer = document.createElement('div');
            floatingContainer.id = 'floating-message-container';
            floatingContainer.style.position = 'fixed';
            floatingContainer.style.top = '16px';
            floatingContainer.style.right = '16px';
            floatingContainer.style.zIndex = '1080';
            floatingContainer.style.minWidth = '280px';
            floatingContainer.style.maxWidth = '420px';
            document.body.appendChild(floatingContainer);
        }

        const floatingAlert = document.createElement('div');
        floatingAlert.className = `alert alert-${type} alert-dismissible fade show`;
        floatingAlert.setAttribute('role', 'alert');
        floatingAlert.innerHTML = `
            <div>${String(message)}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        floatingContainer.appendChild(floatingAlert);

        setTimeout(() => {
            try {
                const alertInstance = bootstrap.Alert.getOrCreateInstance(floatingAlert);
                alertInstance.close();
            } catch {
                floatingAlert.remove();
            }
            if (!floatingContainer.hasChildNodes()) {
                floatingContainer.remove();
            }
        }, 5000);
    }
}