# Parcel Delivery and Tracking System

A full-stack web application for managing parcel deliveries with real-time tracking capabilities.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript, Bootstrap
- **Backend**: Node.js with Express
- **Database**: MongoDB (MongoDB Atlas)
- **Real-time**: Socket.io
- **Maps**: Leaflet

## Features

- Add, view, and manage parcels
- Assign drivers to parcels
- Update parcel status and location
- Real-time parcel tracking with live map updates
- Driver management system
- Dashboard with statistics

## Project Structure

```
parcel-delivery-system/
├── backend/
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── server.js        # Main server file
│   ├── insertSamples.js # Script to insert sample data
│   ├── queries.js       # Example MongoDB queries
│   ├── package.json
│   └── .env
├── frontend/
│   ├── index.html       # Dashboard
│   ├── add-parcel.html
│   ├── parcel-list.html
│   ├── driver-management.html
│   ├── parcel-tracking.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js       # Main JavaScript functions
│   │   └── map.js       # Map functionality
│   └── lib/             # (Optional: for local Bootstrap)
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account (free tier available)
- Git

### MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a free account
2. Create a new cluster (free tier is sufficient)
3. Create a database user with read/write permissions
4. Get your connection string from the "Connect" button
5. Whitelist your IP address (or 0.0.0.0/0 for all IPs during development)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update `MONGODB_URI` with your MongoDB Atlas connection string:
     ```
     MONGODB_URI=mongodb+srv://yourusername:yourpassword@cluster0.xxxxx.mongodb.net/parcel_delivery?retryWrites=true&w=majority
     ```
   - (Optional) If MongoDB Atlas SRV lookups fail on some networks, set DNS resolvers:
     ```
     DNS_SERVERS=8.8.8.8,1.1.1.1
     ```

4. Insert sample data (optional):
   ```bash
   node insertSamples.js
   ```

5. Start the backend server:
   ```bash
   npm start
   ```
   The server will run on http://localhost:5000

### Frontend Setup

1. The frontend consists of static HTML/CSS/JS files.
2. You can start it using npm (recommended):
   ```bash
   cd frontend
   npm install
   npm start
   ```
   Then open http://localhost:3000 in your browser.
3. Or open the HTML files directly in your browser (quickest):
   - Open `frontend/index.html`
4. (Alternative) Serve the frontend files without installing dependencies:
   ```bash
   cd frontend
   npx http-server -p 3000
   ```
   Then open http://localhost:3000 in your browser

### Testing the Application

1. Start the backend server
2. Open the frontend in your browser
3. Navigate to the Dashboard to see statistics
4. Add some parcels using the "Add Parcel" page
5. Assign drivers and update statuses
6. Test real-time tracking on the "Parcel Tracking" page
   - Driver location input accepts a **place name** (auto-geocoded to latitude/longitude)
   - Tracking shows **Destination** using the parcel’s delivery address (place name)

## API Endpoints

### Parcels
- `GET /api/parcels` - Get all parcels
- `POST /api/parcels/add` - Add a new parcel
- `PUT /api/parcels/assign-driver/:parcelId` - Assign driver to parcel
- `PUT /api/parcels/update-status/:parcelId` - Update parcel status
- `POST /api/parcels/update-location` - Update parcel location
- `GET /api/parcels/tracking/:parcelId` - Get tracking data

### Drivers
- `GET /api/drivers` - Get all drivers
- `POST /api/drivers/add` - Add a new driver
- `PUT /api/drivers/:driverId` - Update driver
- `DELETE /api/drivers/:driverId` - Delete driver

## Database Schema

### Parcels Collection
```javascript
{
  parcelId: String (unique),
  senderName: String,
  receiverName: String,
  pickupAddress: String,
  deliveryAddress: String,
  weight: Number,
  status: String (Pending/In Transit/Delivered),
  driverId: String (optional)
}
```

### Drivers Collection
```javascript
{
  driverId: String (unique),
  name: String,
  phone: String,
  vehicleNumber: String,
  routeId: String (optional),
  locationName: String (optional),
  latitude: Number (auto from locationName),
  longitude: Number (auto from locationName)
}
```

### Routes Collection
```javascript
{
  routeId: String (unique),
  startLocation: String,
  endLocation: String,
  stops: Array
}
```

### Tracking Collection
```javascript
{
  parcelId: String,
  driverId: String,
  locationName: String (optional),
  latitude: Number,
  longitude: Number,
  timestamp: Date
}
```

## Example MongoDB Queries

The `queries.js` file contains examples of common MongoDB queries:

- Find parcels in transit
- Find parcels by driver
- Find parcels with weight > 2kg
- Update parcel status

Run queries:
```bash
node queries.js
```

## Real-time Tracking

The application uses Socket.io for real-time updates:
- When a driver updates location, all connected clients receive live updates
- Map markers update automatically without page refresh

## Authorization & Tracking Security

We implemented role-based access control (RBAC) to ensure parcel data remains secure and private. 

### How and Why We Used It
**Why:** Parcel details (like sender, receiver, locations) are sensitive. We want to ensure that a customer cannot simply guess a Parcel ID or query the API to view another person's delivery.
**How:**
- When a user logs in as a `customer`, their identity (`name`) is attached to their session.
- When the frontend requests a list of parcels (`GET /api/parcels`), the backend dynamically filters the database using MongoDB's `$or` operator:
  ```javascript
  $or: [
    { senderName: req.user.name },
    { receiverName: req.user.name }
  ]
  ```
- This ensures that the backend *only* returns parcels where the customer's name exactly matches either the sender or the receiver. 
- The direct tracking API (`GET /api/parcels/tracking/:parcelId`) also verifies ownership before returning any coordinates.

### Use Example for Testing
1. **Create a Parcel:** Log in as an `admin` (or register one). Create a parcel where the Sender is "Alice" and the Receiver is "Bob".
2. **Track as Sender:** Log out, then register/log in as a customer named "Alice". Go to Parcel Tracking. Entering the Parcel ID will successfully show the tracking map.
3. **Track as Receiver:** Log out, then register/log in as a customer named "Bob". Go to Parcel Tracking. Entering the Parcel ID will also work!
4. **Unauthorized Access Test:** Log out, then register/log in as a customer named "Charlie". Enter the exact same Parcel ID. The system will reject the request and show "Parcel not found" because Charlie is neither the sender nor the receiver.

## Deployment

### Backend (Render)
1. Create a Render account
2. Connect your GitHub repository
3. Set environment variables in Render dashboard
4. Deploy

### Frontend (Vercel/Netlify)
1. Upload the `frontend` folder to Vercel or Netlify
2. Update API_BASE_URL in `js/app.js` to point to your deployed backend
3. Deploy

### Database (MongoDB Atlas)
- MongoDB Atlas is already cloud-hosted
- Update IP whitelist for production servers
- Use environment variables for connection strings

## Sample Data

The system includes 10 sample parcels with various statuses. You can add more drivers and routes as needed.

## Development Notes

- All API responses include proper error handling
- Frontend uses Bootstrap for responsive design
- Map integration uses Leaflet (open-source alternative to Google Maps)
- Real-time updates work across multiple browser tabs
- Security: never commit or share real MongoDB credentials. If credentials are exposed, rotate the password in MongoDB Atlas and update `.env`.

## License

This project is for educational purposes.