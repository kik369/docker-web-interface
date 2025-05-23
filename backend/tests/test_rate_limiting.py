import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch


class TestRateLimiting(unittest.TestCase):
    @patch("backend.docker_monitor.DockerService")
    def setUp(self, mock_docker_service):
        from backend.docker_monitor import FlaskApp

        # Create app instance with mock docker service
        self.app_instance = FlaskApp()
        self.app = self.app_instance.app
        self.app.config["TESTING"] = True

        # Configure mocks
        self.mock_docker_service = MagicMock()
        mock_docker_service.return_value = self.mock_docker_service

        # Set up the mock return values with properly formatted data
        mock_container = {
            "id": "test_container_id",
            "name": "test_container",
            "image": "test_image:latest",
            "status": "running",
            "state": "running",
            "created": "2023-01-01T00:00:00",
            "ports": "8080->80/tcp",
            "compose_project": "test_project",
            "compose_service": "test_service",
        }
        mock_image = {
            "id": "sha256:test_image_id",
            "tags": ["test:latest"],
            "size": 10.0,
            "created": "2023-01-01T00:00:00",
            "repo_digests": ["test@sha256:digest"],
            "parent_id": "sha256:parent_id",
            "labels": {"maintainer": "test"},
        }

        self.mock_docker_service.get_all_containers.return_value = (
            [mock_container],
            None,
        )
        self.mock_docker_service.get_container_logs.return_value = ("Test logs", None)
        self.mock_docker_service.start_container.return_value = (True, None)
        self.mock_docker_service.stop_container.return_value = (True, None)
        self.mock_docker_service.restart_container.return_value = (True, None)
        self.mock_docker_service.delete_container.return_value = (True, None)
        self.mock_docker_service.get_all_images.return_value = ([mock_image], None)
        self.mock_docker_service.format_container_data = lambda containers: containers
        self.mock_docker_service.format_image_data = lambda images: images

        self.app_instance.docker_service = self.mock_docker_service

        # Create a test client
        self.client = self.app.test_client()

        # Set up the rate limit
        self.app_instance.current_rate_limit = 10

        # Clear request counts
        self.app_instance.request_counts = {}

    def test_rate_limit_not_exceeded(self):
        # Make a request that should succeed
        response = self.client.get("/api/containers")

        # Check response
        self.assertEqual(response.status_code, 200)

        # Verify a count was recorded
        current_minute = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self.assertIn(current_minute, self.app_instance.request_counts)
        self.assertEqual(self.app_instance.request_counts[current_minute], 1)

    def test_rate_limit_exceeded(self):
        # Set up a situation where rate limit is exceeded
        current_minute = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self.app_instance.request_counts = {
            current_minute: self.app_instance.current_rate_limit
        }

        # Make a request that should be rate limited
        response = self.client.get("/api/containers")

        # Check response
        self.assertEqual(response.status_code, 429)

        # Verify an error was returned
        data = json.loads(response.data)
        self.assertEqual(data["status"], "error")
        self.assertIn("Rate limit exceeded", data["error"])

    def test_rate_limit_cleanup(self):
        # Set up old request counts (more than 2 minutes ago)
        now = datetime.now(timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)
        # Use timedelta for proper datetime arithmetic
        old_minute = current_minute - timedelta(minutes=3)

        # Add counts for both current and old minute
        self.app_instance.request_counts = {current_minute: 5, old_minute: 8}

        # Make a request to trigger cleanup
        response = self.client.get("/api/containers")

        # Verify response was successful
        self.assertEqual(response.status_code, 200)

        # Check that old entries were cleaned up
        self.assertNotIn(old_minute, self.app_instance.request_counts)
        self.assertIn(current_minute, self.app_instance.request_counts)
        self.assertEqual(
            self.app_instance.request_counts[current_minute], 6
        )  # 5 + 1 from this request

    def test_multiple_requests_increment_counter(self):
        # Make multiple requests
        for _ in range(5):
            response = self.client.get("/api/containers")
            self.assertEqual(response.status_code, 200)

        # Check that counter was incremented correctly
        current_minute = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self.assertEqual(self.app_instance.request_counts[current_minute], 5)

    def test_rate_limit_different_endpoints(self):
        # Make requests to different endpoints
        endpoints = [
            "/api/containers",
            "/api/images",
            "/api/containers/test-container/logs",
        ]

        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 200)

        # Check that all requests counted toward the same limit
        current_minute = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self.assertEqual(self.app_instance.request_counts[current_minute], 3)

    def test_rate_limit_reset_after_minute_change(self):
        # Set up counts for previous minute
        now = datetime.now(timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)
        # Use timedelta for proper datetime arithmetic
        previous_minute = current_minute - timedelta(minutes=1)

        self.app_instance.request_counts = {
            previous_minute: self.app_instance.current_rate_limit
        }

        # Make a request in the current minute
        response = self.client.get("/api/containers")

        # Check that request succeeded (rate limit applies per minute)
        self.assertEqual(response.status_code, 200)

        # Verify counts for both minutes
        self.assertEqual(
            self.app_instance.request_counts[previous_minute],
            self.app_instance.current_rate_limit,
        )
        self.assertEqual(self.app_instance.request_counts[current_minute], 1)


if __name__ == "__main__":
    unittest.main()
