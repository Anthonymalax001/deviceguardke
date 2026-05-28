import requests
import time
import socket
import platform
import pyautogui
import os
import sys
import shutil

try:
    import cv2
except:
    cv2 = None

API_BASE = "http://127.0.0.1:5050/api"

USER_ID = 11
MACHINE_ID = socket.gethostname()

# 30 minutes
CAPTURE_INTERVAL = 1800

last_capture_time = 0

print("🚀 DeviceGuard Agent started...")


# ================= AUTO STARTUP =================
def add_to_startup():

    try:

        startup_dir = os.path.join(
            os.getenv("APPDATA"),
            r"Microsoft\Windows\Start Menu\Programs\Startup"
        )

        current_file = os.path.abspath(sys.argv[0])

        startup_file = os.path.join(
            startup_dir,
            "DeviceGuardAgent.exe"
        )

        if not os.path.exists(startup_file):

            shutil.copy(current_file, startup_file)

            print("✅ Added to startup")

        else:

            print("🟢 Startup already enabled")

    except Exception as e:

        print("❌ Startup error:", e)


# RUN STARTUP
add_to_startup()


# ================= NETWORK =================
def get_network_info():

    try:

        res = requests.get(
            "http://ip-api.com/json/",
            timeout=5
        ).json()

        return {
            "ip": res.get("query"),
            "isp": res.get("isp"),
            "city": res.get("city"),
            "country": res.get("country"),
            "latitude": res.get("lat"),
            "longitude": res.get("lon")
        }

    except Exception as e:

        print("❌ Network info error:", e)

        return {}


# ================= DEVICE =================
def get_device_data():

    data = {
        "machine_id": MACHINE_ID,
        "hostname": socket.gethostname(),
        "platform": platform.system(),
        "os_release": platform.version(),
        "user_id": USER_ID
    }

    data.update(get_network_info())

    return data


# ================= SCREENSHOT =================
def capture_screenshot():

    try:

        os.makedirs("temp", exist_ok=True)

        filename = f"screen_{int(time.time())}.png"

        path = os.path.abspath(
            os.path.join("temp", filename)
        )

        print("🖥 Taking screenshot...")
        print("📁 Saving to:", path)

        img = pyautogui.screenshot()

        img.save(path)

        del img

        time.sleep(2)

        if not os.path.exists(path):

            print("❌ Screenshot file missing")
            return None

        size = os.path.getsize(path)

        print("📦 Screenshot size:", size)

        if size <= 0:

            print("❌ Screenshot empty")
            return None

        print("✅ Screenshot captured:", path)

        return path

    except Exception as e:

        print("❌ Screenshot error:", e)

        return None


# ================= CAMERA =================
def capture_camera():

    if cv2 is None:

        print("❌ OpenCV not installed")
        return None

    try:

        os.makedirs("temp", exist_ok=True)

        filename = f"cam_{int(time.time())}.png"

        path = os.path.abspath(
            os.path.join("temp", filename)
        )

        print("📷 Opening camera...")
        print("📁 Saving to:", path)

        cam = cv2.VideoCapture(0, cv2.CAP_DSHOW)

        if not cam.isOpened():

            print("❌ Camera failed to open")
            return None

        for _ in range(5):
            cam.read()
            time.sleep(0.1)

        ret, frame = cam.read()

        cam.release()

        cv2.destroyAllWindows()

        if not ret:

            print("❌ Camera read failed")
            return None

        cv2.imwrite(path, frame)

        time.sleep(2)

        if not os.path.exists(path):

            print("❌ Camera file missing")
            return None

        size = os.path.getsize(path)

        print("📦 Camera size:", size)

        if size <= 0:

            print("❌ Camera file empty")
            return None

        print("✅ Camera captured:", path)

        return path

    except Exception as e:

        print("❌ Camera error:", e)

        return None


# ================= HEARTBEAT =================
def heartbeat():

    try:

        res = requests.post(
            f"{API_BASE}/agent/heartbeat",
            json=get_device_data(),
            timeout=10
        )

        return res.json()

    except Exception as e:

        print("❌ Heartbeat error:", e)

        return {}


# ================= UPLOAD =================
def upload_file(endpoint, file_path, field_name):

    try:

        if not os.path.exists(file_path):

            print("❌ File missing before upload:", file_path)
            return

        size = os.path.getsize(file_path)

        print("📦 Upload file size:", size)

        if size <= 0:

            print("❌ Upload file empty")
            return

        network = get_network_info()

        print(f"📤 Uploading {file_path} ...")

        with open(file_path, "rb") as f:

            files = {
                field_name: (
                    os.path.basename(file_path),
                    f,
                    "image/png"
                )
            }

            data = {
                "machine_id": MACHINE_ID,
                "latitude": network.get("latitude"),
                "longitude": network.get("longitude"),
                "city": network.get("city"),
                "country": network.get("country")
            }

            print("📍 GPS DATA:", data)

            res = requests.post(
                f"{API_BASE}{endpoint}",
                files=files,
                data=data,
                timeout=60
            )

        try:

            print("📤 Upload response:", res.json())

        except:

            print("⚠️ Server response:", res.text)

        time.sleep(5)

        if os.path.exists(file_path):

            try:

                os.remove(file_path)

                print("🧹 Deleted local file")

            except Exception as e:

                print("⚠️ Could not delete file:", e)

    except Exception as e:

        print("❌ Upload error:", e)


# ================= LOOP =================
while True:

    response = heartbeat()

    instruction = response.get("instruction")

    current_time = time.time()

    if instruction == "CAPTURE_EVIDENCE":

        if (
            current_time - last_capture_time
            >= CAPTURE_INTERVAL
        ):

            print("\n🚨 DEVICE MARKED STOLEN")
            print("🚨 CAPTURE TRIGGERED")

            # SCREENSHOT
            ss = capture_screenshot()

            if ss:

                upload_file(
                    "/agent/upload/screenshot",
                    ss,
                    "screenshot"
                )

            # CAMERA
            cam = capture_camera()

            if cam:

                upload_file(
                    "/agent/upload/camera",
                    cam,
                    "camera"
                )

            print("✅ Evidence cycle complete\n")

            last_capture_time = current_time

        else:

            remaining = int(
                CAPTURE_INTERVAL
                - (current_time - last_capture_time)
            )

            print(
                f"⏳ Waiting {remaining}s for next capture..."
            )

    else:

        print("🟢 Device safe... monitoring")

    time.sleep(10)