const express = require('express');
const router = express.Router();
const Parcel = require('../models/Parcel');
const Driver = require('../models/Driver');
const Tracking = require('../models/Tracking');
const { protect, restrictTo } = require('../middleware/authMiddleware');

async function geocodeLocation(locationName) {
  const encodedLocation = encodeURIComponent(locationName.trim());
  const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodedLocation}`;

  const response = await fetch(geocodeUrl, {
    headers: {
      'User-Agent': 'ParcelDeliverySystem/1.0 (learning-project)'
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding service returned ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const latitude = Number(data[0].lat);
  const longitude = Number(data[0].lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

// Add a new parcel
router.post('/add', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { parcelId, senderName, receiverName, pickupAddress, deliveryAddress, weight } = req.body;

    // Validate required fields
    if (!parcelId || !senderName || !receiverName || !pickupAddress || !deliveryAddress || !weight) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Create new parcel
    const newParcel = new Parcel({
      parcelId,
      senderName,
      receiverName,
      pickupAddress,
      deliveryAddress,
      weight
    });

    // Save to database
    await newParcel.save();
    res.status(201).json({ message: 'Parcel added successfully', parcel: newParcel });
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      res.status(400).json({ message: 'Parcel ID already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
});

// View all parcels
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'customer') {
      // Customers can only see parcels where they are the sender or receiver
      query = {
        $or: [
          { senderName: req.user.name },
          { receiverName: req.user.name }
        ]
      };
    }
    const parcels = await Parcel.find(query);
    res.status(200).json(parcels);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// View parcels for logged in driver
router.get('/driver-parcels', protect, restrictTo('driver'), async (req, res) => {
  try {
    const driverId = req.user.userId;
    console.log('Fetching parcels for driverId:', driverId);
    const parcels = await Parcel.find({ driverId });
    console.log('Found parcels:', parcels.length);
    res.status(200).json(parcels);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Alias for getting parcels for a specific driver ID
router.get('/driver/:driverId', protect, restrictTo('driver', 'admin'), async (req, res) => {
  try {
    const { driverId } = req.params;
    // Ensure drivers can only view their own parcels
    if (req.user.role === 'driver' && req.user.userId !== driverId) {
      return res.status(403).json({ message: 'Forbidden: You can only view your own parcels' });
    }
    const parcels = await Parcel.find({ driverId });
    res.status(200).json(parcels);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Assign driver to parcel
router.put('/assign-driver/:parcelId', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { parcelId } = req.params;
    const { driverId } = req.body;

    // Check if driver exists
    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Update parcel
    const updatedParcel = await Parcel.findOneAndUpdate(
      { parcelId },
      { driverId },
      { new: true }
    );

    if (!updatedParcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    // Auto-create an initial tracking point so new assignments don't start with empty map history.
    // Skip this if tracking already exists for the parcel.
    const hasTrackingHistory = await Tracking.exists({ parcelId });
    if (!hasTrackingHistory && driver.latitude !== null && driver.longitude !== null) {
      const initialTracking = await Tracking.create({
        parcelId,
        driverId,
        latitude: driver.latitude,
        longitude: driver.longitude
      });

      const io = req.app.get('io');
      io.emit('locationUpdated', {
        parcelId,
        latitude: initialTracking.latitude,
        longitude: initialTracking.longitude,
        timestamp: initialTracking.timestamp
      });
    }

    res.status(200).json({
      message: 'Driver assigned successfully',
      parcel: updatedParcel
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update parcel status
router.put('/update-status/:parcelId', protect, restrictTo('admin', 'driver'), async (req, res) => {
  try {
    const { parcelId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['Pending', 'In Transit', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Update parcel
    const updatedParcel = await Parcel.findOneAndUpdate(
      { parcelId },
      { status },
      { new: true }
    );

    if (!updatedParcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    res.status(200).json({ message: 'Status updated successfully', parcel: updatedParcel });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update parcel location (for tracking)
router.post('/update-location', protect, restrictTo('admin', 'driver'), async (req, res) => {
  try {
    const { parcelId, driverId, location, latitude, longitude } = req.body;

    // Validate required fields
    if (!parcelId || !driverId) {
      return res.status(400).json({ message: 'Parcel ID and driver ID are required' });
    }
    
    if (!location && (latitude === undefined || longitude === undefined)) {
       return res.status(400).json({ message: 'Either location name or latitude/longitude is required' });
    }

    // Accept location updates only while parcel is in transit.
    const parcel = await Parcel.findOne({ parcelId });
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }
    if (parcel.status === 'Delivered') {
      return res.status(400).json({
        message: 'Parcel Delivered ✔ Final Location Reached'
      });
    }
    if (parcel.status !== 'In Transit') {
      return res.status(400).json({
        message: 'Location updates are allowed only when parcel status is In Transit'
      });
    }

    let coordinates;
    let locName = location ? location.trim() : `Lat: ${latitude}, Lng: ${longitude}`;
    
    if (latitude !== undefined && longitude !== undefined) {
      coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    } else {
      try {
        coordinates = await geocodeLocation(location);
      } catch (geocodeError) {
        return res.status(502).json({
          message: 'Unable to reach geocoding service. Please try again.'
        });
      }
    }

    if (!coordinates) {
      return res.status(400).json({
        message: 'Invalid location name or coordinates. Please check inputs.'
      });
    }

    // Create new tracking entry
    const newTracking = new Tracking({
      parcelId,
      driverId,
      locationName: locName,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });

    // Save to database
    await newTracking.save();

    // Emit real-time update via Socket.io (will be handled in server.js)
    const io = req.app.get('io');
    io.emit('locationUpdated', {
      parcelId,
      locationName: locName,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timestamp: newTracking.timestamp
    });

    res.status(201).json({
      message: 'Location updated successfully',
      tracking: newTracking,
      resolvedLocation: {
        query: locName,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get parcel tracking data
router.get('/tracking/:parcelId', protect, async (req, res) => {
  try {
    const { parcelId } = req.params;

    if (req.user.role === 'customer') {
      const parcel = await Parcel.findOne({ parcelId });
      if (!parcel || (parcel.senderName !== req.user.name && parcel.receiverName !== req.user.name)) {
        return res.status(403).json({ message: 'Forbidden: You can only track your own parcels' });
      }
    }

    const trackingData = await Tracking.find({ parcelId }).sort({ timestamp: -1 });
    res.status(200).json(trackingData);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;