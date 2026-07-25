import os
import uvicorn
from app import create_app

app = create_app()

if __name__ == '__main__':
    # PORT is injected by the host (Railway/Render) at runtime; read it here in Python so
    # the start command never has to shell-expand "$PORT" — that avoids the platform passing
    # the literal string "$PORT" to the server. Falls back to 5000 for bare local runs.
    port = int(os.environ.get('PORT', 5000))
    # reload is a local-dev convenience ONLY (spawns a file watcher and re-imports the app);
    # it must never run in production. Enable locally with RELOAD=true python main.py.
    reload = os.environ.get('RELOAD', 'false').lower() == 'true'
    # reload needs the import-string form; production serves the already-built app object.
    uvicorn.run("main:app" if reload else app, host="0.0.0.0", port=port, reload=reload)
