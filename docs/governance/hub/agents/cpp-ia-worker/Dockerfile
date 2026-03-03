FROM python:3.12-alpine

RUN apk add --no-cache git openssh-client ca-certificates

WORKDIR /app
COPY app.py /app/app.py

ENV PORT=8080
ENV WORKER_ID=CPP-IA
ENV WORKER_ROLE=analysis
ENV WORKER_SERVICE=govhub-cpp-ia-worker
ENV GITOPS_ENABLED=false
ENV GITOPS_ALLOWED_BASE=/workspace
ENV GITOPS_DEFAULT_REMOTE=origin
ENV GITOPS_DEFAULT_BASE_BRANCH=main
ENV GITOPS_TIMEOUT_SECONDS=20

EXPOSE 8080

CMD ["python", "/app/app.py"]
