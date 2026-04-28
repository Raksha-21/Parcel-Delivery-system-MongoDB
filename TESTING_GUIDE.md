# Driver Dashboard Testing Guide

This guide explains how to test the new Driver Dashboard features, the technologies used behind the scenes, and an example scenario to verify that everything works correctly.

## What We Are Using & Why

1. **MongoDB & Mongoose (Database)**: 
   - **Why:** We use MongoDB to store all persistent data (Users, Parcels, Drivers, Tracking history). 
   - **What to test:** When you update a parcel's status or location, we want to ensure it is permanently saved in the database so it's not lost when you refresh the page.

2. **JSON Web Tokens (JWT Auth)**:
   - **Why:** To securely verify who is logged in. 
   - **What to test:** We ensure that when a driver logs in, they get a unique token. The backend uses this token to find the `driverId` and strictly return *only* the parcels assigned to that specific driver.

3. **Latitude & Longitude Coordinates**:
   - **Why:** Originally, the system used string names (like "Bangalore") which rely on external geocoding APIs that can fail or be inaccurate. Using exact Latitude and Longitude ensures pinpoint accuracy for live tracking on a map.

4. **Socket.io (Real-Time Updates)**:
   - **Why:** Without Socket.io, users would have to manually refresh the page to see if a parcel moved. Socket.io keeps an open connection between the server and the browser, allowing the server to push updates instantly.
   - **What to test:** When a location is updated, the dashboard should refresh the data automatically without you pressing F5.

---

## Step-by-Step Testing Example

Follow this scenario to test the entire Driver Dashboard flow.

### Prerequisites
Make sure your backend server is running (`npm start` in the `backend` folder) and your frontend is running (`npx http-server -p 3000` in the `frontend` folder).

### Step 1: Create a Driver & Assign a Parcel (Admin Side)
*If you already have a driver and an assigned parcel, skip to Step 2.*
1. Go to `http://localhost:3000/login.html` and log in as an **Admin**.
2. Go to **Driver Management** and add a new driver (e.g., Driver ID: `D-101`, Name: `John Doe`).
3. Go to **Add Parcel** and create a new parcel.
4. Go to the **Dashboard** (Admin) and assign the new parcel to Driver `D-101`.
5. Click **Logout**.

### Step 2: Log in as the Driver
1. Go to `http://localhost:3000/login.html`
2. Register a new user account with the role **Driver** using the *exact same Driver ID* (`D-101`) you created in Step 1.
3. Log in with those credentials.
4. **Verification:**
   - You should be redirected to the **Driver Dashboard**.
   - Check the top right Navbar: It should display your name (e.g., "Driver: John Doe").
   - Check the Table: You should **only** see the parcel assigned to `D-101`.

### Step 3: Test Status Update
1. On the Driver Dashboard, find your parcel and click the blue **🔄 Status** button.
2. Change the status from `Pending` to `In Transit` and click **Save changes**.
3. **Verification:** 
   - The status badge on the table should immediately turn blue and say "In Transit".
   - *Note: Location updates are only allowed when a parcel is "In Transit", so doing this step is mandatory!*

### Step 4: Test Real-Time Location Update (Latitude/Longitude)
1. Now that the parcel is `In Transit`, the green **📍 Location** button will be enabled. Click it.
2. In the modal, enter the following coordinates:
   - **Latitude:** `12.9716`
   - **Longitude:** `77.5946`
   *(These are the coordinates for Bangalore)*
3. Click **Update Location**.
4. **Verification:**
   - You should see a green success message: "Location updated successfully!".
   - Behind the scenes, Socket.io broadcasts this new location.
   - You can verify this permanently saved by going to the Customer Tracking page and tracking the Parcel ID. You will see the new coordinate point in the history!

### Step 5: Test Delivery Completion
1. Click the blue **🔄 Status** button again.
2. Change the status to `Delivered`.
3. **Verification:**
   - The status badge should turn green and say "Delivered".
   - The **📍 Location** button should now be disabled, as a delivered parcel can no longer move.

---
**Troubleshooting:** If you see "Error loading parcels", check the console (`F12` -> Console tab) to ensure your backend is running on port `5000` and there are no MongoDB connection issues.
