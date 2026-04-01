import React from 'react';
import { useNearbyUsers } from '../hooks/useNearbyUsers';
import { MapPin, MessageCircle, UserPlus } from 'lucide-react';

const NearbyList: React.FC = () => {
  const { nearbyUsers, isLoading, error } = useNearbyUsers(5);

  if (error) return <div className="p-4 text-tg-text-danger">{error}</div>;
  if (isLoading) return <div className="p-4 text-tg-text-secondary">Scanning...</div>;

  return (
    <div className="flex flex-col h-full bg-tg-bg-primary p-4 space-y-4 overflow-y-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <MapPin className="text-tg-accent" /> People Nearby
      </h2>
      
      {nearbyUsers.length === 0 ? (
        <div className="text-tg-text-secondary text-center py-10">
          No one found nearby. Make sure your visibility is on!
        </div>
      ) : (
        <div className="grid gap-4">
          {nearbyUsers.map((user) => (
            <div 
              key={user.id} 
              className="flex items-center justify-between p-3 bg-tg-bg-elevated rounded-xl hover:bg-tg-bg-hover transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} className="w-12 h-12 rounded-full" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-tg-accent flex items-center justify-center font-bold">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-tg-bg-primary ${user.status === 'online' ? 'bg-tg-online' : 'bg-tg-offline'}`} />
                </div>
                <div>
                  <h3 className="font-medium">{user.username}</h3>
                  <span className="text-xs text-tg-text-secondary">Nearby</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button className="p-2 text-tg-text-secondary hover:text-tg-accent transition-colors">
                  <UserPlus size={20} />
                </button>
                <button className="p-2 text-tg-text-secondary hover:text-tg-accent transition-colors">
                  <MessageCircle size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NearbyList;
