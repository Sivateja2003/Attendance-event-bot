import { useState, useEffect } from 'react'

export default function UserAvatar({ src, name, imgClass, fallbackClass, children, apiBase = '' }) {
  const [broken, setBroken] = useState(false)

  useEffect(() => { setBroken(false) }, [src])

  if (!src || broken) {
    return <div className={fallbackClass}>{children ?? name?.[0]}</div>
  }

  return (
    <img
      src={`${apiBase}${src}`}
      alt={name}
      className={imgClass}
      onError={() => setBroken(true)}
    />
  )
}
