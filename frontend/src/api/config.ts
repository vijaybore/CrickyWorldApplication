// Use your PC's local IP so both browser AND phone (Expo Go on same WiFi) can reach the backend.
// Browser: http://localhost:5000 works locally too because the PC serves both.
// Phone:   http://10.252.230.93:5000 routes over LAN to your PC where the backend is running.
const API_BASE_URL = "http://10.252.230.93:5000";

export default API_BASE_URL;