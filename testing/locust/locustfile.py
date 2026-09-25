import csv
import os
import uuid
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from locust import HttpUser, between, events, tag, task
from locust.exception import StopUser


ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS_FILE = Path(
    os.getenv("LOCUST_CREDENTIALS_FILE", ROOT / "testing/locust/.users.csv")
)
SUPABASE_URL = (os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
ENABLE_WRITES = os.getenv("LOCUST_ENABLE_WRITES", "0") == "1"
FAIL_RATIO_MAX = float(os.getenv("LOCUST_FAIL_RATIO_MAX", "0.01"))
P95_MAX_MS = int(os.getenv("LOCUST_P95_MAX_MS", "1500"))
TIMEZONE = ZoneInfo("America/Argentina/San_Juan")


def _tomorrow_iso():
    return (datetime.now(TIMEZONE).date() + timedelta(days=1)).isoformat()


def _load_credentials():
    if not CREDENTIALS_FILE.exists():
        raise RuntimeError(
            f"Missing Locust credentials file: {CREDENTIALS_FILE}. "
            "Run: npm run locust:seed"
        )

    rows = []
    with CREDENTIALS_FILE.open("r", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            email = (row.get("email") or "").strip()
            password = row.get("password") or ""
            if not email or not password:
                continue
            rows.append({
                "email": email,
                "password": password,
                "company_slug": (row.get("company_slug") or "global").strip() or "global",
                "location": (row.get("location") or "La Laja").strip() or "La Laja",
            })
    if not rows:
        raise RuntimeError(f"No valid credentials in {CREDENTIALS_FILE}")
    return deque(rows)


if not SUPABASE_URL:
    raise RuntimeError("Missing VITE_SUPABASE_URL/SUPABASE_URL")
if not SUPABASE_ANON_KEY:
    raise RuntimeError("Missing VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY")

CREDENTIALS = _load_credentials()


@events.init.add_listener
def validate_configuration(environment, **_kwargs):
    tags = set(getattr(getattr(environment, "parsed_options", None), "tags", None) or [])
    if "write" in tags and not ENABLE_WRITES:
        raise RuntimeError(
            "Write test requested but LOCUST_ENABLE_WRITES is not 1. "
            "Read-only is the safe default."
        )


@events.quitting.add_listener
def enforce_thresholds(environment, **_kwargs):
    stats = environment.stats.total
    if stats.num_requests == 0:
        return
    p95 = stats.get_response_time_percentile(0.95) or 0
    if stats.fail_ratio > FAIL_RATIO_MAX or p95 > P95_MAX_MS:
        environment.process_exit_code = 2


class OrderAppUser(HttpUser):
    host = SUPABASE_URL
    wait_time = between(2, 6)

    def on_start(self):
        if not CREDENTIALS:
            raise StopUser(
                "No unused synthetic credentials remain. Seed at least as many users as Locust -u."
            )

        self.credential = CREDENTIALS.popleft()
        self.access_token = ""
        self.user_id = ""
        self.menu_item = None
        self.order_created = False
        self.delivery_date = os.getenv("LOCUST_DELIVERY_DATE") or _tomorrow_iso()
        self.company_slug = self.credential["company_slug"]
        self.location = self.credential["location"]

        self._login()
        self._prime_menu()

    def _public_headers(self):
        return {
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

    def _auth_headers(self):
        return {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _login(self):
        with self.client.post(
            "/auth/v1/token?grant_type=password",
            json={
                "email": self.credential["email"],
                "password": self.credential["password"],
            },
            headers=self._public_headers(),
            name="AUTH password login",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"login status={response.status_code}: {response.text[:300]}")
                raise StopUser()

            data = response.json()
            self.access_token = data.get("access_token") or ""
            self.user_id = (data.get("user") or {}).get("id") or ""
            if not self.access_token or not self.user_id:
                response.failure("login response missing access_token/user.id")
                raise StopUser()
            response.success()

    def _checked(self, method, path, name, expected=(200,), **kwargs):
        with self.client.request(
            method,
            path,
            headers=self._auth_headers(),
            name=name,
            catch_response=True,
            **kwargs,
        ) as response:
            if response.status_code not in expected:
                response.failure(
                    f"status={response.status_code}, expected={expected}: {response.text[:300]}"
                )
                return None
            response.success()
            if not response.text:
                return None
            try:
                return response.json()
            except ValueError:
                return None

    def _prime_menu(self):
        data = self._checked(
            "GET",
            (
                "/rest/v1/menu_items"
                "?select=id,name,description,created_at,menu_date,company_slug"
                f"&menu_date=eq.{self.delivery_date}"
                "&company_slug=eq.global"
                "&order=created_at.desc"
            ),
            "BOOT menu global",
        )
        if isinstance(data, list) and data:
            first = data[0]
            self.menu_item = {
                "id": first.get("id") or "locust-menu",
                "name": first.get("name") or "Menú de prueba",
                "quantity": 1,
            }

    @tag("read", "smoke")
    @task(6)
    def dashboard_orders(self):
        self._checked(
            "GET",
            (
                "/rest/v1/orders?select=*"
                f"&user_id=eq.{self.user_id}"
                "&order=created_at.desc&limit=200"
            ),
            "READ dashboard orders",
        )

    @tag("read", "smoke")
    @task(3)
    def menu_global(self):
        self._prime_menu()

    @tag("read")
    @task(2)
    def menu_company(self):
        if self.company_slug == "global":
            return
        self._checked(
            "GET",
            (
                "/rest/v1/menu_items"
                "?select=id,name,description,created_at,menu_date,company_slug"
                f"&menu_date=eq.{self.delivery_date}"
                f"&company_slug=eq.{self.company_slug}"
                "&order=created_at.desc"
            ),
            "READ company menu",
        )

    @tag("read", "smoke")
    @task(3)
    def schedule_context(self):
        self._checked(
            "POST",
            "/rest/v1/rpc/get_order_schedule_context",
            "READ schedule context RPC",
            json={"p_location": self.location, "p_at": None},
        )

    @tag("read")
    @task(2)
    def visible_custom_options(self):
        self._checked(
            "POST",
            "/rest/v1/rpc/get_visible_custom_options",
            "READ visible custom options RPC",
            json={
                "p_company": self.company_slug,
                "p_meal": "lunch",
                "p_date": self.delivery_date,
                "p_country_code": "AR",
            },
        )

    @tag("read")
    @task(1)
    def own_profile(self):
        self._checked(
            "GET",
            f"/rest/v1/users?select=id,email,full_name,role&id=eq.{self.user_id}&limit=1",
            "READ own profile",
        )

    @tag("write")
    @task(1)
    def create_one_test_order(self):
        if not ENABLE_WRITES or self.order_created or not self.menu_item:
            return

        idem = f"locust-{self.user_id}-{uuid.uuid4()}"
        payload = {
            "user_id": self.user_id,
            "location": self.location,
            "customer_name": "Locust Load Test",
            "customer_email": self.credential["email"],
            "customer_phone": "",
            "items": [self.menu_item],
            "comments": "LOCUST_LOAD_TEST",
            "delivery_date": self.delivery_date,
            "status": "pending",
            "total_items": 1,
            "custom_responses": [],
            "idempotency_key": idem,
            "service": "lunch",
        }

        data = self._checked(
            "POST",
            "/rest/v1/rpc/create_order_idempotent",
            "WRITE create_order_idempotent",
            expected=(200, 201),
            json={
                "p_user_id": self.user_id,
                "p_idempotency_key": idem,
                "p_payload": payload,
            },
        )
        if data is not None:
            self.order_created = True
            self._checked(
                "GET",
                (
                    "/rest/v1/orders?select=id,status,delivery_date,service"
                    f"&user_id=eq.{self.user_id}"
                    f"&delivery_date=eq.{self.delivery_date}"
                    "&service=eq.lunch&order=created_at.desc&limit=5"
                ),
                "WRITE verify order visibility",
            )
