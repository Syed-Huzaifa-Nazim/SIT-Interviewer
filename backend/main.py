import os
import uvicorn
from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Run uvicorn server binding to 0.0.0.0 for container compatibility
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
