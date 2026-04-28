const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Parcel = require('../models/Parcel');
const Tracking = require('../models/Tracking');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const LEGACY_DEFAULT_LAT = 40.7128;
const LEGACY_DEFAULT_LNG = -74.0060;

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

// Add a new driver
router.post('/add', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { driverId, name, phone, vehicleNumber, routeId, latitude, longitude, locationName } = req.body;

    // Validate required fields
    if (!driverId || !name || !phone || !vehicleNumber) {
      return res.status(400).json({ message: 'Driver ID, name, phone, and vehicle number are required' });
    }

    const hasCoords = latitude !== undefined && longitude !== undefined &&
      !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude));
    const hasPlace = typeof locationName === 'string' && locationName.trim().length > 0;

    let resolved = null;
    if (!hasCoords && hasPlace) {
      try {
        resolved = await geocodeLocation(locationName);
      } catch {
        return res.status(502).json({ message: 'Unable to reach geocoding service. Please try again.' });
      }
      if (!resolved) {
        return res.status(400).json({ message: 'Invalid location name. Please enter a clearer place name.' });
      }
    }

    if (!hasCoords && !resolved) {
      return res.status(400).json({ message: 'Provide either a valid location name or valid latitude/longitude' });
    }

    // Create new driver
    const newDriver = new Driver({
      driverId,
      name,
      phone,
      vehicleNumber,
      routeId,
      locationName: hasPlace ? locationName.trim() : null,
      latitude: resolved ? resolved.latitude : Number(latitude),
      longitude: resolved ? resolved.longitude : Number(longitude)
    });

    // Save to database
    await newDriver.save();
    res.status(201).json({ message: 'Driver added successfully', driver: newDriver });
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      res.status(400).json({ message: 'Driver ID already exists' });
    } else {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
});

// View all drivers
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const drivers = await Driver.find();
    res.status(200).json(drivers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update driver
router.put('/:driverId', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { driverId } = req.params;
    const updates = { ...req.body };

    // Allow updating by place name; if provided without coords, geocode it.
    const hasPlace = typeof updates.locationName === 'string' && updates.locationName.trim().length > 0;
    const hasCoords = updates.latitude !== undefined && updates.longitude !== undefined;
    if (hasPlace && !hasCoords) {
      let resolved = null;
      try {
        resolved = await geocodeLocation(updates.locationName);
      } catch {
        return res.status(502).json({ message: 'Unable to reach geocoding service. Please try again.' });
      }
      if (!resolved) {
        return res.status(400).json({ message: 'Invalid location name. Please enter a clearer place name.' });
      }
      updates.latitude = resolved.latitude;
      updates.longitude = resolved.longitude;
      updates.locationName = updates.locationName.trim();
    } else if (updates.locationName !== undefined) {
      updates.locationName = String(updates.locationName).trim() || null;
    }

    if (updates.latitude !== undefined && Number.isNaN(Number(updates.latitude))) {
      return res.status(400).json({ message: 'Latitude must be a valid number' });
    }
    if (updates.longitude !== undefined && Number.isNaN(Number(updates.longitude))) {
      return res.status(400).json({ message: 'Longitude must be a valid number' });
    }
    if (updates.latitude !== undefined) {
      updates.latitude = Number(updates.latitude);
    }
    if (updates.longitude !== undefined) {
      updates.longitude = Number(updates.longitude);
    }

    // Update driver
    const updatedDriver = await Driver.findOneAndUpdate(
      { driverId },
      updates,
      { new: true }
    );

    if (!updatedDriver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Backfill legacy placeholder tracking points created before driver coordinates existed.
    // If a parcel has exactly one tracking point at the old default coordinates, replace it.
    if (updates.latitude !== undefined && updates.longitude !== undefined) {
      const assignedParcels = await Parcel.find({ driverId }, { parcelId: 1, _id: 0 });

      for (const parcel of assignedParcels) {
        const count = await Tracking.countDocuments({ parcelId: parcel.parcelId });
        if (count !== 1) {
          continue;
        }

        const onlyTracking = await Tracking.findOne({ parcelId: parcel.parcelId });
        if (!onlyTracking) {
          continue;
        }

        const isLegacyDefault =
          Math.abs(onlyTracking.latitude - LEGACY_DEFAULT_LAT) < 0.000001 &&
          Math.abs(onlyTracking.longitude - LEGACY_DEFAULT_LNG) < 0.000001;

        if (isLegacyDefault) {
          onlyTracking.latitude = updates.latitude;
          onlyTracking.longitude = updates.longitude;
          await onlyTracking.save();

          const io = req.app.get('io');
          io.emit('locationUpdated', {
            parcelId: parcel.parcelId,
            latitude: onlyTracking.latitude,
            longitude: onlyTracking.longitude,
            timestamp: onlyTracking.timestamp
          });
        }
      }
    }

    res.status(200).json({ message: 'Driver updated successfully', driver: updatedDriver });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete driver
router.delete('/:driverId', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { driverId } = req.params;

    // Delete driver
    const deletedDriver = await Driver.findOneAndDelete({ driverId });

    if (!deletedDriver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;