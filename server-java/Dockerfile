# Build
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app
# исходники и библиотека FastCGI
COPY server-java/java-src /app/java-src
COPY lib /app/lib
# важно: -cp указывает на fastcgi-lib.jar, чтобы компилятор видел com.fastcgi.*
RUN javac -cp /app/lib/fastcgi-lib.jar -d /app/out $(find /app/java-src -name "*.java")

# Run
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/out /app/out
COPY --from=build /app/lib /app/lib
# для надёжности укажем classpath явно
CMD ["java","-cp","/app/out:/app/lib/fastcgi-lib.jar","-DFCGI_PORT=9000","app.Server"]

