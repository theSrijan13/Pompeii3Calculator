import * as React from 'react';

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <title>JewelCost AI Logo</title>
      <path d="M10 12h3M12 10v3" />
      <path d="M12 2a10 10 0 1 0 10 10" />
      <path d="M12 2a10 10 0 0 1 3.34 19.34" />
      <path d="M12 2a10 10 0 0 0-3.34 19.34" />
      <path d="M4.66 8.66l14.68 14.68" />
    </svg>
  );
}
