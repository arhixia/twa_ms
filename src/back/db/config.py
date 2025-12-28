import os

from dotenv import load_dotenv
load_dotenv()

TOKEN = os.environ.get('TOKEN')
DB_HOST = os.environ.get('DB_HOST')
DB_PORT = os.environ.get('DB_PORT')
DB_NAME = os.environ.get('DB_NAME')
DB_PASS = os.environ.get('DB_PASS')
DB_USER = os.environ.get('DB_USER')
SECRET_KEY= os.environ.get('SECRET_KEY')
ADMIN_BOOTSTRAP_TOKEN = os.environ.get('ADMIN_BOOTSTRAP_TOKEN')
ACCESS_KEY_S3 = os.environ.get('ACCESS_KEY_S3')
SECRET_KEY_S3 = os.environ.get('SECRET_KEY_S3')
ENDPOINT_URL_S3 = os.environ.get('ENDPOINT_URL_S3')
BUCKET_NAME_S3 = os.environ.get('BUCKET_NAME_S3')
WEB_APP_URL = os.environ.get('WEB_APP_URL')
REDIS_CLIENT_URL = os.environ.get('REDIS_CLIENT_URL')

