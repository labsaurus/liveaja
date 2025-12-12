#!/bin/bash

FILE_ID=$1
OUTPUT_FILE=$2
COOKIE_FILE="/tmp/gdrive_cookie_${FILE_ID}_${RANDOM}.txt"

echo "[Shell] logic started for ID: $FILE_ID"

# 1. Try Direct UserComponent URL (Matches user's script preference)
# We use -c and -b to handle cookies for the session
URL="https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download"
echo "[Shell] Attempting direct download from: $URL"

curl -L -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$URL" -o "$OUTPUT_FILE"

# 2. Check if result is HTML (Virus Warning)
MIME_TYPE=$(file -b --mime-type "$OUTPUT_FILE")
echo "[Shell] Result MIME Check: $MIME_TYPE"

if [[ "$MIME_TYPE" == *"text/html"* ]]; then
    echo "[Shell] Detected HTML warning. Attempting to extract confirm token..."
    
    # We grep the downloaded HTML file for the token
    # Regex looks for confirm=XXXX
    CONFIRM_TOKEN=$(grep -o 'confirm=[a-zA-Z0-9_]*' "$OUTPUT_FILE" | head -n 1 | cut -d '=' -f 2)
    
    if [ -z "$CONFIRM_TOKEN" ]; then
        echo "[Shell] No token found in HTML. Trying default 't'..."
        CONFIRM_TOKEN="t"
    else 
        echo "[Shell] Token found: $CONFIRM_TOKEN"
    fi
    
    # 3. Retry with confirm token
    URL_CONFIRM="https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=${CONFIRM_TOKEN}"
    echo "[Shell] Retrying with token: $URL_CONFIRM"
    
    curl -L -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$URL_CONFIRM" -o "$OUTPUT_FILE"
    
    # Final Check
    FINAL_MIME=$(file -b --mime-type "$OUTPUT_FILE")
    echo "[Shell] Final MIME: $FINAL_MIME"
    
    if [[ "$FINAL_MIME" == *"text/html"* ]]; then
        echo "[Shell] FAILURE: Still received HTML after confirm."
        rm -f "$COOKIE_FILE"
        exit 1
    fi
fi

# Cleanup
rm -f "$COOKIE_FILE"
echo "[Shell] Success."
exit 0
