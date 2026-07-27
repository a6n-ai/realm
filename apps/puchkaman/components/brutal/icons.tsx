/** Monochrome stroke icons — match ThemeToggle (currentColor, strokeWidth 2.6). */

type IconProps = {
  className?: string;
  size?: number;
};

export function IconCart({ className, size = 20 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.4 11.2h10.4L20 8H7.2" />
      <path d="M7 15.2h10.2" />
    </svg>
  );
}

/** Delivery scooter — Order Now CTA companion. */
export function IconBike({ className, size = 18 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M9 17.5h5.2M14 17.5V9.5h4l2 3.5v4.5" />
      <path d="M9 12.5H6.5L5 9.5h5.5l1.5 3" />
      <path d="M14 9.5V7.5h2.5" />
    </svg>
  );
}
