let currentToast = null;
let toastTimeout = null;

export function showToast(message, duration = 3000) {
  if (!currentToast) {
    currentToast = document.createElement('div');
    currentToast.className = 'toast';
    document.body.appendChild(currentToast);
  }
  
  currentToast.textContent = message;
  currentToast.classList.add('show');
  
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  toastTimeout = setTimeout(() => {
    currentToast.classList.remove('show');
    setTimeout(() => {
      if (currentToast && !currentToast.classList.contains('show')) {
        currentToast.remove();
        currentToast = null;
      }
    }, 300);
  }, duration);
}