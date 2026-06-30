FROM node:22-trixie

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jdk-headless ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /workspace

COPY app/review-console/package*.json app/review-console/
RUN cd app/review-console && npm ci

COPY . .
RUN chmod +x ./gradlew

EXPOSE 5173 8787

CMD ["npm", "test"]
