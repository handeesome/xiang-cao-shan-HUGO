{{- $swJS := resources.Get "sw.js" | resources.ExecuteAsTemplate "sw.js" . | resources.Minify | resources.Fingerprint -}}
if (navigator.serviceWorker) {
  navigator.serviceWorker.register(
    "{{ $swJS.RelPermalink }}", 
    { scope: "{{ "./" | relURL }}" }
  );
}
