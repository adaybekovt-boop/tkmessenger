import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      setUser(data.user);
      toast.success('Welcome back!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-tg-bg-secondary p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-tg-bg-primary rounded-2xl shadow-xl">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-tg-accent rounded-full text-white">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M6 22L38 9L30 35L21 27L13 31L15 22Z" fill="white" opacity="0.92"/>
              <path d="M21 27L30 18L15 22" fill="white" opacity="0.45"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-tg-text-primary">Orbits P2P</h2>
          <p className="mt-2 text-tg-text-secondary">Decentralized. Private. Yours.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <input
                type="email"
                required
                className="w-full px-4 py-3 bg-tg-bg-input text-tg-text-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-tg-accent transition-all"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="w-full px-4 py-3 bg-tg-bg-input text-tg-text-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-tg-accent transition-all"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-tg-accent hover:bg-opacity-90 text-white font-medium rounded-xl transition-all disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Join Network'}
          </button>
        </form>

        <p className="text-center text-tg-text-secondary">
          New to Orbits?{' '}
          <Link to="/register" className="text-tg-accent hover:underline">
            Register now
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
