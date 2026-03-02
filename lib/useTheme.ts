import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  appTitle?: string;
}

const DEFAULT_THEME: Theme = {
  primaryColor: "#7335d6", // Default primary color (oklch(0.45 0.18 260) converted to hex)
  secondaryColor: "#64748b",
  logoUrl: undefined,
  appTitle: "IMD Accelerator",
};

/**
 * Convert hex color to oklch format for CSS variables
 */
function hexToOklch(hex: string): string {
  // Simple conversion - for production, use a proper color conversion library
  // This is a simplified version that approximates the conversion
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  // Convert RGB to linear RGB
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const rLinear = toLinear(r);
  const gLinear = toLinear(g);
  const bLinear = toLinear(b);
  
  // Convert to XYZ (D65)
  const x = rLinear * 0.4124564 + gLinear * 0.3575761 + bLinear * 0.1804375;
  const y = rLinear * 0.2126729 + gLinear * 0.7151522 + bLinear * 0.0721750;
  const z = rLinear * 0.0193339 + gLinear * 0.1191920 + bLinear * 0.9503041;
  
  // Convert to Lab
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;
  
  const fx = xn > 0.008856 ? Math.pow(xn, 1/3) : (7.787 * xn + 16/116);
  const fy = yn > 0.008856 ? Math.pow(yn, 1/3) : (7.787 * yn + 16/116);
  const fz = zn > 0.008856 ? Math.pow(zn, 1/3) : (7.787 * zn + 16/116);
  
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);
  
  // Convert Lab to LCH (approximate)
  const c = Math.sqrt(a * a + bLab * bLab);
  const h = Math.atan2(bLab, a) * (180 / Math.PI);
  const hNormalized = h < 0 ? h + 360 : h;
  
  // Approximate oklch (simplified - for production use a proper library)
  const lightness = l / 100;
  const chroma = c / 150; // Approximate scaling
  const hue = hNormalized;
  
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

/**
 * Apply theme to CSS variables
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  
  if (theme.primaryColor) {
    const oklch = hexToOklch(theme.primaryColor);
    root.style.setProperty("--primary", oklch);
    root.style.setProperty("--sidebar-primary", oklch);
  }
  
  if (theme.secondaryColor) {
    const oklch = hexToOklch(theme.secondaryColor);
    root.style.setProperty("--secondary", oklch);
  }
}

/**
 * Hook to fetch and manage theme for a client
 */
export function useTheme(subdomain?: string, clientId?: string) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTheme() {
      try {
        setLoading(true);
        setError(null);
        
        let resolvedClientId = clientId;
        
        // If we have subdomain but no clientId, fetch clientId from subdomain
        if (subdomain && !clientId) {
          const { data: client, error: clientError } = await supabase
            .from("clients")
            .select("id")
            .eq("subdomain", subdomain)
            .single();
          
          if (clientError || !client) {
            console.warn("Client not found for subdomain:", subdomain);
            setTheme(DEFAULT_THEME);
            setLoading(false);
            return;
          }
          
          resolvedClientId = client.id;
        }
        
        if (!resolvedClientId) {
          setTheme(DEFAULT_THEME);
          setLoading(false);
          return;
        }
        
        // Fetch theme from API
        const response = await fetch(`/api/themes/${resolvedClientId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch theme");
        }
        
        const data = await response.json();
        const fetchedTheme = data.theme || DEFAULT_THEME;
        
        // Merge with defaults
        const mergedTheme: Theme = {
          ...DEFAULT_THEME,
          ...fetchedTheme,
        };
        
        setTheme(mergedTheme);
        applyTheme(mergedTheme);
      } catch (err) {
        console.error("Error fetching theme:", err);
        setError(err instanceof Error ? err.message : "Failed to load theme");
        setTheme(DEFAULT_THEME);
        applyTheme(DEFAULT_THEME);
      } finally {
        setLoading(false);
      }
    }
    
    fetchTheme();
  }, [subdomain, clientId]);
  
  return { theme, loading, error };
}
