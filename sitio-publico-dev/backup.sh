#!/bin/bash

# --- CONFIGURACIÓN ---
PROYECTO_DIR="/var/www/sitio-publico"
RESPALDO_DIR="$PROYECTO_DIR/backups"
FECHA=$(date +"%Y-%m-%d_%H-%M")
ARCHIVO_FINAL="$RESPALDO_DIR/RESPALDO_TOTAL_$FECHA.tar.gz"
DB_CONTAINER="9acd6760693e_sitio-publico-db-1"

# Asegurar que exista la carpeta de respaldos local
mkdir -p $RESPALDO_DIR

echo "=== Iniciando Respaldo Semanal [$FECHA] ==="

# 1. Extraer la base de datos desde el contenedor de Docker activo
echo "1. Exportando base de datos MySQL de Docker..."
docker exec $DB_CONTAINER mysqldump -u root -pShadow24k auditoriafibra > $RESPALDO_DIR/temporal_db.sql

# 2. Comprimir la base de datos SQL + la carpeta real de tus Planos/PDFs
echo "2. Comprimiendo archivos y planos as-built..."
tar -czf $ARCHIVO_FINAL -C $PROYECTO_DIR public/uploads -C $RESPALDO_DIR temporal_db.sql

# 3. Subir el paquete a Google Drive (Creará una carpeta llamada 'Respaldos_Auditoria')
echo "3. Subiendo paquete a Google Drive (5TB)..."
rclone copy $ARCHIVO_FINAL gdrive:Respaldos_Auditoria

# 4. Limpieza para no saturar el disco duro del servidor físico
echo "4. Limpiando archivos temporales..."
rm $RESPALDO_DIR/temporal_db.sql

# Borrar respaldos locales viejos de más de 30 días para liberar espacio local
find $RESPALDO_DIR -type f -name "*.tar.gz" -mtime +30 -delete

echo "=== ¡Respaldo completado con éxito en la Nube! ==="
