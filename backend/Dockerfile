FROM python:3.9-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa poppler-utils build-essential && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --compile -r requirements.txt
COPY . .
# Nota: Easypanel gestionará el puerto, pero es bueno exponerlo.
EXPOSE 5000
# El comando para iniciar el servidor de producción.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "300", "app:app"]