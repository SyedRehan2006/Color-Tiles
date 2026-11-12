// True in the Poki submission build (`npm run build:poki`, Vite mode "poki"). Vite replaces the check at
// build time, so code behind `if (!POKI)` is removed from the submitted files.
// The Poki build: cyberpunk 6 only, no settings/debug panels, no saved tuning, no debug readout.
export const POKI = import.meta.env.MODE === "poki";
