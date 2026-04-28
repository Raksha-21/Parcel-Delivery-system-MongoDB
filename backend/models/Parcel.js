const mongoose = require('mongoose');

// Define the Parcel schema
const parcelSchema = new mongoose.Schema({
  parcelId: {
    type: String,
    required: true,
    unique: true
  },
  senderName: {
    type: String,
    required: true
  },
  receiverName: {
    type: String,
    required: true
  },
  pickupAddress: {
    type: String,
    required: true
  },
  deliveryAddress: {
    type: String,
    required: true
  },
  weight: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'In Transit', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  driverId: {
    type: String,
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Create the Parcel model
const Parcel = mongoose.model('Parcel', parcelSchema);

module.exports = Parcel;