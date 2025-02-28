import os
import sys

# Add the parent directory to sys.path to allow importing the backend package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Any shared fixtures for tests can be defined here
