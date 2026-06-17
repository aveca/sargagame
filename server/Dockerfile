FROM python:3.11-slim

WORKDIR /app

COPY server/ /app/

RUN pip install --no-cache-dir flask

EXPOSE 5000

ENV FLASK_APP=api.py
ENV FLASK_ENV=production

CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
