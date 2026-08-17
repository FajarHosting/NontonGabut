import os
import sys

# Make project-root modules such as bot.py importable.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, request
from poll import handler

app = Flask(__name__)


@app.route("/", methods=["GET"])
@app.route("/api", methods=["GET"])
def api_root():
    return handler(request)


@app.route("/api/poll", methods=["GET"])
def api_poll():
    return handler(request)
