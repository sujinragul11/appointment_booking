package com.booking.util;

import java.util.List;

/** Minimal RFC 4180 CSV builder with spreadsheet formula-injection protection. */
public final class CsvWriter {

    private final StringBuilder sb = new StringBuilder();

    public CsvWriter row(Object... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(escape(values[i]));
        }
        sb.append("\r\n");
        return this;
    }

    public CsvWriter row(List<?> values) {
        return row(values.toArray());
    }

    static String escape(Object value) {
        if (value == null) return "";
        String s = value.toString();
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0 && !(value instanceof Number)) {
            s = "'" + s;
        }
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    @Override
    public String toString() {
        return sb.toString();
    }

    public byte[] toBytes() {
        // UTF-8 BOM so Excel opens non-ASCII names correctly
        return ("﻿" + sb).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
}
