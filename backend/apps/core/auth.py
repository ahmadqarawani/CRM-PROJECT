from rest_framework.authentication import SessionAuthentication


class SessionAuth(SessionAuthentication):
    """DRF's documented way to get 401 (not 403) for 'not logged in' with session auth:
    a 401 must carry a WWW-Authenticate scheme, and the base class returns none."""

    def authenticate_header(self, request):
        return "Session"
