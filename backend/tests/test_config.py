import os
import unittest
from unittest.mock import patch


class TestConfig(unittest.TestCase):
    def setUp(self):
        # Clear environment variables before each test
        for key in [
            "DEBUG",
            "PORT",
            "HOST",
            "LOG_LEVEL",
            "MAX_REQUESTS_PER_MINUTE",
            "REFRESH_INTERVAL",
        ]:
            if key in os.environ:
                del os.environ[key]

    def test_default_config(self):
        # Import the module to load default config
        from backend.config import Config

        # Check default values
        self.assertFalse(Config.DEBUG)
        self.assertEqual(Config.PORT, 5000)
        self.assertEqual(Config.HOST, "0.0.0.0")
        self.assertEqual(Config.LOG_LEVEL, "INFO")
        self.assertEqual(Config.MAX_REQUESTS_PER_MINUTE, 1000)
        self.assertEqual(Config.REFRESH_INTERVAL, 30)

    def test_environment_variable_override(self):
        # Set environment variables
        os.environ["DEBUG"] = "true"
        os.environ["PORT"] = "8080"
        os.environ["LOG_LEVEL"] = "DEBUG"
        os.environ["MAX_REQUESTS_PER_MINUTE"] = "500"

        # Reload the module to pick up new environment variables
        import importlib

        import backend.config

        importlib.reload(backend.config)
        from backend.config import Config

        # Check overridden values
        self.assertTrue(Config.DEBUG)
        self.assertEqual(Config.PORT, 8080)
        self.assertEqual(Config.LOG_LEVEL, "DEBUG")
        self.assertEqual(Config.MAX_REQUESTS_PER_MINUTE, 500)

    def test_config_validation_max_requests(self):
        # Test validation for invalid MAX_REQUESTS_PER_MINUTE
        with patch.dict(os.environ, {"MAX_REQUESTS_PER_MINUTE": "0"}):
            with self.assertRaises(ValueError):
                import importlib

                import backend.config

                importlib.reload(backend.config)

    def test_config_validation_port_too_high(self):
        # Test validation for PORT too high
        with patch.dict(os.environ, {"PORT": "99999"}):
            with self.assertRaises(ValueError):
                import importlib

                import backend.config

                importlib.reload(backend.config)

    def test_config_validation_port_too_low(self):
        # Test validation for PORT too low
        with patch.dict(os.environ, {"PORT": "0"}):
            with self.assertRaises(ValueError):
                import importlib

                import backend.config

                importlib.reload(backend.config)

    def test_config_validation_refresh_interval(self):
        # Test validation for invalid REFRESH_INTERVAL
        with patch.dict(os.environ, {"REFRESH_INTERVAL": "0"}):
            with self.assertRaises(ValueError):
                import importlib

                import backend.config

                importlib.reload(backend.config)

    def test_config_to_dict(self):
        # Import the module
        from backend.config import Config

        # Get config as dictionary
        config_dict = Config.to_dict()

        # Check that it contains expected keys
        expected_keys = [
            "DEBUG",
            "PORT",
            "HOST",
            "LOG_LEVEL",
            "LOG_FORMAT",
            "LOG_FILE",
            "DOCKER_PS_FORMAT",
            "MAX_REQUESTS_PER_MINUTE",
            "REFRESH_INTERVAL",
            "CORS_ORIGINS",
        ]

        for key in expected_keys:
            self.assertIn(key, config_dict)

        # Check that values match
        self.assertEqual(config_dict["PORT"], Config.PORT)
        self.assertEqual(config_dict["HOST"], Config.HOST)
        self.assertEqual(config_dict["LOG_LEVEL"], Config.LOG_LEVEL)

    def test_cors_origins_parsing(self):
        # Test CORS_ORIGINS parsing from comma-separated string
        os.environ["CORS_ORIGINS"] = "http://localhost:3000,http://example.com"

        # Reload the module
        import importlib

        import backend.config

        importlib.reload(backend.config)
        from backend.config import Config

        # Check parsed value
        self.assertEqual(
            Config.CORS_ORIGINS, ["http://localhost:3000", "http://example.com"]
        )

    def test_log_format_parsing(self):
        # Test LOG_FORMAT parsing
        test_cases = [
            ("json", "json"),
            ("JSON", "json"),
            ("text", "text"),
            ("anything_else", "text"),
        ]

        for env_value, expected_value in test_cases:
            os.environ["LOG_FORMAT"] = env_value

            # Reload the module
            import importlib

            import backend.config

            importlib.reload(backend.config)
            from backend.config import Config

            # Check parsed value
            self.assertEqual(
                Config.LOG_FORMAT, "json" if expected_value == "json" else "text"
            )


if __name__ == "__main__":
    unittest.main()
