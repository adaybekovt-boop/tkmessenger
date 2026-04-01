import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<div className="flex items-center justify-center h-screen bg-tg-bg-secondary text-tg-text-primary">Orbits Messenger Initializing...</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
