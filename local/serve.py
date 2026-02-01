import http.server
import socketserver
import os
import time
import sys

PORT = 8000
DIRECTORY = os.getcwd()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True

class HotReloadHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Server-Sent Events endpoint
        if self.path == '/_events':
            self.send_response(200)
            self.send_header('Content-type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            last_mtime = self.get_max_mtime()
            try:
                while True:
                    current_mtime = self.get_max_mtime()
                    if current_mtime > last_mtime:
                        self.wfile.write(b'data: reload\n\n')
                        self.wfile.flush()
                        last_mtime = current_mtime
                    time.sleep(0.5)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        # Inject script into HTML files
        if self.path.endswith('.html') or self.path == '/' or self.path == '':
            # Handle default index file
            target_path = self.path
            if target_path == '/' or target_path == '':
                target_path = '/punyu.html' # Default to punyu.html
                # If file doesn't exist, let super handle it.
                if not os.path.exists(os.path.join(DIRECTORY, 'punyu.html')):
                     super().do_GET()
                     return

            path = self.translate_path(target_path)
            
            if os.path.exists(path) and not os.path.isdir(path) and path.endswith('.html'):
                try:
                    with open(path, 'rb') as f:
                        content = f.read()
                    
                    script = b"""
                    <script>
                    (function() {
                        console.log("[HotReload] Connected");
                        var evtSource = new EventSource("/_events");
                        evtSource.onmessage = function(e) {
                            if (e.data == "reload") {
                                console.log("[HotReload] Reloading...");
                                location.reload();
                            }
                        };
                        evtSource.onerror = function() {
                            console.log("[HotReload] Connection lost, reconnecting...");
                        };
                    })();
                    </script>
                    </body>
                    """
                    
                    # Replace closing body tag with script + closing body tag
                    if b'</body>' in content:
                        content = content.replace(b'</body>', script)
                    else:
                        content += script

                    self.send_response(200)
                    self.send_header("Content-type", "text/html")
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    print(f"Error serving {path}: {e}")
        
        super().do_GET()

    def log_message(self, format, *args):
        # Cool logs
        message = format % args
        # 404 in red, 200 in green, others cyan
        color = "\033[96m" # Cyan
        if " 404 " in message:
            color = "\033[91m" # Red
        elif " 200 " in message:
            color = "\033[92m" # Green
            
        sys.stderr.write("%s[%s] %s%s\033[0m\n" %
                         (color,
                          self.log_date_time_string(),
                          message,
                          ""))

    def get_max_mtime(self):
        max_mtime = 0
        # Only check relevant files to avoid performance hit
        for root, dirs, files in os.walk(DIRECTORY):
            if 'node_modules' in dirs:
                dirs.remove('node_modules')
            if '.git' in dirs:
                dirs.remove('.git')
                
            for file in files:
                if file.endswith('.html') or file.endswith('.js') or file.endswith('.css'):
                    try:
                        mtime = os.stat(os.path.join(root, file)).st_mtime
                        if mtime > max_mtime:
                            max_mtime = mtime
                    except OSError:
                        pass
        return max_mtime

# Try to find an open port
start_port = PORT
while True:
    try:
        httpd = ThreadingHTTPServer(("", start_port), HotReloadHandler)
        print(f"Serving at http://localhost:{start_port}")
        break
    except OSError:
        start_port += 1

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
