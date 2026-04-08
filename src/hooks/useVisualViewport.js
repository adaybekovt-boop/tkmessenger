import { useEffect } from 'react';

function setVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const height = vv?.height || window.innerHeight;
      const offsetTop = vv?.offsetTop || 0;
      setVar('--orb-vvh', `${height * 0.01}px`);
      setVar('--orb-vv-offset-top', `${offsetTop}px`);
    };

    update();
    if (!vv) {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}

