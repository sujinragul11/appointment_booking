import { useEffect, useState } from 'react';
import { getConfig } from '../api/site';

/** Public client configuration (GET /config): null until loaded, then the config object. */
export default function useSiteConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let active = true;
    getConfig().then((c) => { if (active) setConfig(c); });
    return () => { active = false; };
  }, []);
  return config;
}
