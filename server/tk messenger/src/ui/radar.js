import Peer from 'peerjs';

export class Radar {
  constructor(options) {
    this.options = options;
    this.radarPeer = null;
    this.view = document.getElementById('radar-view');
    this.results = document.getElementById('radar-results');
    this.btn = document.getElementById('radar-scan-btn');
    this.active = false;
    
    if (this.btn) {
      this.btn.addEventListener('click', () => this.scan());
    }
  }
  
  activate() {
    if (this.view) this.view.style.display = 'flex';
    this.active = true;
  }
  
  deactivate() {
    if (this.view) this.view.style.display = 'none';
    this.active = false;
    this.dispose();
  }
  
  scan() {
    if (!this.results) return;
    this.results.innerHTML = '<p>Scanning...</p>';
    if (this.radarPeer) this.radarPeer.destroy();
    
    this.radarPeer = new Peer();
    this.radarPeer.on('open', (id) => {
      setTimeout(() => {
        if (!this.active) return;
        this.results.innerHTML = '';
        const found = ['nearby_user_1', 'nearby_user_2'];
        found.forEach(peerId => {
          if (this.options.getBlockedPeers().includes(peerId)) return;
          const div = document.createElement('div');
          div.className = 'radar-result-item';
          div.innerHTML = `
            <span>${peerId}</span>
            <button class="tg-primary-btn send-btn">Message</button>
            <button class="settings-btn add-btn">Add</button>
          `;
          div.querySelector('.send-btn').onclick = () => this.options.onSendMessage(peerId);
          div.querySelector('.add-btn').onclick = () => this.options.onAddContact(peerId);
          this.results.appendChild(div);
        });
      }, 2000);
    });
  }
  
  dispose() {
    if (this.radarPeer) {
      this.radarPeer.destroy();
      this.radarPeer = null;
    }
  }
}