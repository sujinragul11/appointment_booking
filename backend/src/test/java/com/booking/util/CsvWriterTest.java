package com.booking.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CsvWriterTest {

    @Test
    void plainValuesAreWrittenAsIs() {
        String csv = new CsvWriter().row("a", 1, 2.5, LocalDate.of(2030, 1, 9), true).toString();

        assertThat(csv).isEqualTo("a,1,2.5,2030-01-09,true\r\n");
    }

    @Test
    void valuesWithSeparatorsQuotesOrLineBreaksAreQuoted() {
        assertThat(CsvWriter.escape("Doe, Jane")).isEqualTo("\"Doe, Jane\"");
        assertThat(CsvWriter.escape("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(CsvWriter.escape("two\nlines")).isEqualTo("\"two\nlines\"");
        assertThat(CsvWriter.escape("carriage\rreturn")).isEqualTo("\"carriage\rreturn\"");
        assertThat(CsvWriter.escape(null)).isEmpty();
        assertThat(CsvWriter.escape("")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"=SUM(A1:A2)", "+1+1", "-2+3", "@cmd", "\tTAB"})
    void formulaTriggersArePrefixedWithAQuote(String value) {
        assertThat(CsvWriter.escape(value)).isEqualTo("'" + value);
    }

    @Test
    void formulaPrefixIsAppliedBeforeQuoting() {
        assertThat(CsvWriter.escape("=HYPERLINK(\"http://evil\",\"x\")"))
                .isEqualTo("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
        assertThat(CsvWriter.escape("\rcmd")).isEqualTo("\"'\rcmd\"");
    }

    @Test
    void numbersAreNeverPrefixed() {
        assertThat(CsvWriter.escape(-5)).isEqualTo("-5");
        assertThat(CsvWriter.escape(-12.5)).isEqualTo("-12.5");
        assertThat(CsvWriter.escape("-5")).as("but numeric-looking text is").isEqualTo("'-5");
    }

    @Test
    void rowsFromListsAndEmptyRows() {
        CsvWriter w = new CsvWriter().row(List.of("h1", "h2")).row().row(Arrays.asList("x", null));

        assertThat(w.toString()).isEqualTo("h1,h2\r\n\r\nx,\r\n");
    }

    @Test
    void bytesStartWithAUtf8ByteOrderMark() {
        byte[] bytes = new CsvWriter().row("Zoë").toBytes();

        assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
        assertThat(new String(bytes, StandardCharsets.UTF_8)).isEqualTo("﻿Zoë\r\n");
    }
}
