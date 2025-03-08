from setuptools import find_packages, setup

setup(
    name="docker-web-interface",
    version="0.1.0",
    packages=find_packages(include=["."]),
    install_requires=[
        "flask>=2.0.0",
        "gunicorn>=20.1.0",
        "python-dotenv>=0.19.0",
        "flask-cors>=3.0.10",
        "python-json-logger>=2.0.0",
        "prometheus-client>=0.16.0",
        "docker>=7.1.0",
        "eventlet>=0.39.0",
        "flask-socketio>=5.5.1",
    ],
)
