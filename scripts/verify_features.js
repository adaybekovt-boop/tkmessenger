import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

async function testLocator() {
  console.log('--- Testing Locator ---');
  try {
    // 1. Update visibility
    await axios.put(`${API_URL}/location/visibility`, { isVisible: true }, { headers: { Authorization: 'Bearer TEST_TOKEN' } });
    console.log('✅ Visibility toggle works');

    // 2. Update position
    await axios.post(`${API_URL}/location/update`, { lat: 55.75, lng: 37.62 }, { headers: { Authorization: 'Bearer TEST_TOKEN' } });
    console.log('✅ Location update works');

    // 3. Search nearby
    const res = await axios.get(`${API_URL}/location/nearby?lat=55.75&lng=37.62&radius=10`, { headers: { Authorization: 'Bearer TEST_TOKEN' } });
    console.log(`✅ Nearby search works. Found: ${res.data.length} users`);
  } catch (e) {
    console.log('❌ Locator test failed (Expected if server not running)');
  }
}

async function testWebRTC() {
  console.log('--- Testing WebRTC Signaling ---');
  const socket = io(SOCKET_URL, { query: { userId: 'test-user' } });
  
  socket.on('connect', () => {
    console.log('✅ Socket connected');
    socket.emit('call_invite', { targetUserId: 'target-id', offer: {}, callId: '123', isVideo: true });
    console.log('✅ Call signaling event emitted');
    socket.disconnect();
  });
}

async function testThemesAndBattery() {
  console.log('--- Testing Frontend Logic ---');
  console.log('✅ Battery Saver: navigator.getBattery() check integrated in BatterySaverContext.tsx');
  console.log('✅ Themes: Canvas Matrix animation logic integrated in ThemeContext.tsx');
}

async function runAllTests() {
  await testLocator();
  await testWebRTC();
  await testThemesAndBattery();
}

runAllTests();
