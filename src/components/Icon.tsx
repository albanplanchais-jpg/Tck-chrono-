const paths: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  share: 'M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v8h14v-8',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5'
}

export function Icon({ name, size = 22, stroke = 2.4 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
