from cto_ai import ux, prompt, sdk
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello_world():
    return 'Hello, World!'

if __name__ == '__main__':
    ux.print("Starting server")
    app.run(host='0.0.0.0', port=8080)

