export function WalletAuditLogo({ size = 32, className = "" }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="256" cy="256" r="256" fill="url(#paint0_radial_logo)"/>
      <circle cx="256" cy="256" r="190" stroke="#1D4ED8" strokeWidth="12" strokeOpacity="0.3"/>
      <circle cx="256" cy="256" r="140" stroke="#3B82F6" strokeWidth="16" strokeOpacity="0.2" strokeDasharray="40 40"/>
      <path d="M106 256 H156 L206 146 C210 136 222 136 226 146 L286 366 C290 376 302 376 306 366 L356 186 L386 256 H406" stroke="#3B82F6" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6"/>
      <path d="M106 256 H156 L206 146 C210 136 222 136 226 146 L286 366 C290 376 302 376 306 366 L356 186 L386 256 H406" stroke="white" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <radialGradient id="paint0_radial_logo" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(256 256) rotate(90) scale(256)">
          <stop stopColor="#0F172A"/>
          <stop offset="1" stopColor="#000000"/>
        </radialGradient>
      </defs>
    </svg>
  );
}