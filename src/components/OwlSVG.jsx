export default function OwlSVG({ size = 260, style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <line x1="100" y1="0" x2="100" y2="30" stroke="rgba(139,92,246,0.3)" strokeWidth="1"/>
      <line x1="100" y1="170" x2="100" y2="200" stroke="rgba(139,92,246,0.3)" strokeWidth="1"/>
      <line x1="0" y1="100" x2="30" y2="100" stroke="rgba(236,72,153,0.3)" strokeWidth="1"/>
      <line x1="170" y1="100" x2="200" y2="100" stroke="rgba(236,72,153,0.3)" strokeWidth="1"/>
      <circle cx="100" cy="16" r="3" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1"/>
      <circle cx="100" cy="184" r="3" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1"/>
      {/* Body */}
      <ellipse cx="100" cy="115" rx="52" ry="62" fill="rgba(15,15,26,0.9)" stroke="rgba(139,92,246,0.6)" strokeWidth="1.5"/>
      {/* Wings */}
      <path d="M48 100 Q20 90 18 130 Q25 140 48 130 Z" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.4)" strokeWidth="1"/>
      <path d="M152 100 Q180 90 182 130 Q175 140 152 130 Z" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.4)" strokeWidth="1"/>
      {/* Head */}
      <ellipse cx="100" cy="72" rx="40" ry="38" fill="rgba(15,15,26,0.95)" stroke="rgba(139,92,246,0.6)" strokeWidth="1.5"/>
      {/* Ears */}
      <path d="M68 44 L62 22 L78 40 Z" fill="rgba(15,15,26,0.9)" stroke="rgba(139,92,246,0.5)" strokeWidth="1"/>
      <path d="M132 44 L138 22 L122 40 Z" fill="rgba(15,15,26,0.9)" stroke="rgba(139,92,246,0.5)" strokeWidth="1"/>
      {/* Left eye */}
      <circle cx="84" cy="72" r="14" fill="rgba(10,10,20,1)" stroke="rgba(236,72,153,0.7)" strokeWidth="1.5"/>
      <circle cx="84" cy="72" r="8" fill="rgba(236,72,153,0.1)"/>
      <circle cx="84" cy="72" r="5" fill="rgba(236,72,153,0.85)"/>
      <circle cx="86" cy="70" r="1.5" fill="white" opacity="0.9"/>
      {/* Right eye */}
      <circle cx="116" cy="72" r="14" fill="rgba(10,10,20,1)" stroke="rgba(139,92,246,0.7)" strokeWidth="1.5"/>
      <circle cx="116" cy="72" r="8" fill="rgba(139,92,246,0.1)"/>
      <circle cx="116" cy="72" r="5" fill="rgba(139,92,246,0.85)"/>
      <circle cx="118" cy="70" r="1.5" fill="white" opacity="0.9"/>
      {/* Beak */}
      <path d="M96 82 L100 90 L104 82 Z" fill="rgba(245,158,11,0.85)"/>
      {/* Circuit on body */}
      <line x1="80" y1="110" x2="120" y2="110" stroke="rgba(34,211,160,0.3)" strokeWidth="0.8"/>
      <line x1="100" y1="100" x2="100" y2="160" stroke="rgba(34,211,160,0.3)" strokeWidth="0.8"/>
      <circle cx="80" cy="110" r="2" fill="rgba(34,211,160,0.5)"/>
      <circle cx="120" cy="110" r="2" fill="rgba(34,211,160,0.5)"/>
      <circle cx="100" cy="130" r="2" fill="rgba(236,72,153,0.5)"/>
      {/* Talons */}
      <path d="M82 175 L74 188 M82 175 L80 190 M82 175 L88 188" stroke="rgba(139,92,246,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M118 175 L126 188 M118 175 L120 190 M118 175 L112 188" stroke="rgba(139,92,246,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
