# Railway API - PHP 8.3 with Apache
FROM php:8.3-apache

# Install required PHP extensions
RUN apt-get update && apt-get install -y \
    libzip-dev \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libonig-dev \
    libxml2-dev \
    libcurl4-openssl-dev \
    zip \
    unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        mbstring \
        curl \
        json \
        xml \
        zip \
        gd \
        opcache \
    && pecl install redis && docker-php-ext-enable redis

# Enable Apache modules
RUN a2enmod rewrite headers ssl

# PHP Configuration
RUN echo "memory_limit = 256M" > /usr/local/etc/php/conf.d/custom.ini \
    && echo "max_execution_time = 1500" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "upload_max_filesize = 50M" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "post_max_size = 50M" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "opcache.enable = 1" >> /usr/local/etc/php/conf.d/custom.ini \
    && echo "opcache.memory_consumption = 128" >> /usr/local/etc/php/conf.d/custom.ini

# Copy API files
COPY api/ /var/www/html/

# Permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Apache config for clean URLs
RUN echo '<Directory /var/www/html>\n\
    Options -Indexes +FollowSymLinks\n\
    AllowOverride All\n\
    Require all granted\n\
</Directory>' > /etc/apache2/conf-available/sargasse.conf \
    && a2enconf sargasse

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost/api/_diag.php || exit 1

CMD ["apache2-foreground"]