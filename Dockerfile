# Quiz ni Dether — production image (used by Dokploy)
#   Stage 1 builds the React app, stage 2 runs PHP 8.2 + Apache.

# ---------- 1. Build the React frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# vite.config.js writes the build to ../app  ->  /build/app
RUN npm run build

# ---------- 2. PHP + Apache ----------
FROM php:8.2-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod headers remoteip \
 && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && { \
      echo 'expose_php = Off'; \
      echo 'max_execution_time = 120'; \
      echo 'post_max_size = 16M'; \
      echo 'upload_max_filesize = 16M'; \
    } > "$PHP_INI_DIR/conf.d/quiz.ini"

COPY docker/apache-quiz.conf /etc/apache2/conf-available/quiz.conf
RUN a2enconf quiz

WORKDIR /var/www/html
COPY index.php ./
COPY api/ ./api/
COPY includes/ ./includes/
COPY templates/ ./templates/
COPY --from=frontend /build/app ./app/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
