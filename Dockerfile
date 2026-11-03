# syntax=docker/dockerfile:1
# Builds client and server into one image: the server serves the Angular client itself (static/), /api and /ws.
# The build context is the repository root (the folder containing client/ and server/), see compose.yaml.

# --- client -----------------------------------------------------------------------------------------------------------
FROM node:24 AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client/angular.json client/tsconfig.json client/tsconfig.app.json ./
COPY client/src ./src
# the production build takes the origin from the browser, so the image does not depend on a host name
RUN npx ng build --configuration production --base-href /

# --- server -----------------------------------------------------------------------------------------------------------
FROM maven:3-eclipse-temurin-27 AS server
WORKDIR /server
COPY server/pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY server/src ./src
# replace the client copy in the sources by the fresh build
RUN rm -rf src/main/resources/static && mkdir -p src/main/resources/static
COPY --from=client /client/dist/portalsync/ ./src/main/resources/static/
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

# --- runtime ----------------------------------------------------------------------------------------------------------
FROM eclipse-temurin:27-jre
RUN useradd --uid 10001 --create-home app && mkdir -p /media && chown app /media
WORKDIR /app
COPY --from=server /server/target/portalsync-server.war app.war
USER app
ENV SPRING_PROFILES_ACTIVE=prod \
    MEDIA_PATH=/media/
VOLUME /media
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.war"]
