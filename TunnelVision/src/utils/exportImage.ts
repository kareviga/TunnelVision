export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function printAsPDF(dataUrl: string, title: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      @page { margin: 0; size: auto landscape; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
      img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
    </style>
  </head><body>
    <img src="${dataUrl}" />
    <script>window.onload = () => { setTimeout(() => window.print(), 250); window.onafterprint = () => window.close(); }<\/script>
  </body></html>`)
  win.document.close()
}
