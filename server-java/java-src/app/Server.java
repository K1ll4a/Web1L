package app;

import com.fastcgi.FCGIInterface;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;


public class Server {


    private static final Deque<Map<String, Object>> HISTORY = new ArrayDeque<>();
    private static final int MAX_HISTORY = 200;


    private static boolean inRect(double x, double y, double r) {

        return x >= 0 && y <= 0 && x <= r && y >= -r / 2.0;
    }

    private static boolean inTriangle(double x, double y, double r) {

        return x <= 0 && y >= 0 && x >= -r / 2.0 && y <= r / 2.0 && y >= -x - r / 2.0;
    }

    private static boolean inCircle(double x, double y, double r) {

        return x >= 0 && y >= 0 && x <= r && y <= r && (x * x + y * y) <= r * r;
    }

    private static boolean hitTest(double x, double y, double r) {
        return inRect(x, y, r) || inTriangle(x, y, r) || inCircle(x, y, r);
    }

    private static Map<String, Object> handle(double x, double y, double r) {
        long t0 = System.nanoTime();
        boolean rect = inRect(x, y, r);
        boolean tri  = inTriangle(x, y, r);
        boolean circ = inCircle(x, y, r);
        boolean hit  = rect || tri || circ;
        long durMs = Math.max(0, Math.round((System.nanoTime() - t0) / 1_000_000.0));

        Map<String, Object> item = new LinkedHashMap<>();
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        fmt.setTimeZone(TimeZone.getTimeZone("Europe/Moscow"));
        item.put("time", fmt.format(new Date()));
        item.put("x", x);
        item.put("y", y);
        item.put("r", r);
        item.put("hit", hit);
        item.put("durationMs", durMs);
        item.put("debugRect", rect);
        item.put("debugTri", tri);
        item.put("debugCirc", circ);

        synchronized (HISTORY) {
            HISTORY.addFirst(item);
            while (HISTORY.size() > MAX_HISTORY) HISTORY.removeLast();
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("ok", true);
        resp.put("item", item);
        resp.put("history", new ArrayList<>(HISTORY));
        return resp;
    }


    private static String json(Object o) {
        StringBuilder sb = new StringBuilder();
        writeJson(sb, o);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeJson(StringBuilder sb, Object o) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof String) {
            sb.append('"')
                    .append(((String) o).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append('"');
            return;
        }
        if (o instanceof Number || o instanceof Boolean) { sb.append(o.toString()); return; }
        if (o instanceof Map) {
            sb.append('{'); boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!first) sb.append(',');
                sb.append('"')
                        .append(e.getKey().replace("\\", "\\\\").replace("\"", "\\\""))
                        .append('"').append(':');
                writeJson(sb, e.getValue());
                first = false;
            }
            sb.append('}');
            return;
        }
        if (o instanceof Iterable) {
            sb.append('['); boolean first = true;
            for (Object v : (Iterable<?>) o) {
                if (!first) sb.append(',');
                writeJson(sb, v);
                first = false;
            }
            sb.append(']');
            return;
        }
        sb.append('"').append(o.toString()).append('"');
    }

    private static Map<String, String> parseJsonBody(String body) {
        Map<String, String> m = new HashMap<>();
        if (body == null) return m;
        String t = body.trim();
        if (t.startsWith("{")) t = t.substring(1);
        if (t.endsWith("}")) t = t.substring(0, t.length() - 1);
        for (String p : t.split(",")) {
            String[] kv = p.split(":", 2);
            if (kv.length != 2) continue;
            String k = kv[0].trim().replace("\"", "");
            String v = kv[1].trim().replace("\"", "");
            m.put(k, v);
        }
        return m;
    }

    private static String error(String msg) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("ok", false);
        r.put("error", msg);
        return json(r);
    }

    public static void main(String[] args) throws Exception {
        FCGIInterface fcgi = new FCGIInterface();
        final byte[] headers = ("Status: 200 OK\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8);

        while (true) {
            int rc = fcgi.FCGIaccept();
            if (rc < 0) {
                try { Thread.sleep(10); } catch (InterruptedException ignored) {}
                continue;
            }


            Properties props = System.getProperties();
            String method      = Optional.ofNullable(props.getProperty("REQUEST_METHOD")).orElse("GET");
            String contentType = Optional.ofNullable(props.getProperty("CONTENT_TYPE")).orElse("");
            String scriptName  = Optional.ofNullable(props.getProperty("SCRIPT_NAME")).orElse("");
            String pathInfo    = Optional.ofNullable(props.getProperty("PATH_INFO")).orElse("");
            String requestUri  = Optional.ofNullable(props.getProperty("REQUEST_URI")).orElse("");
            int contentLen = 0;
            try {
                String cl = props.getProperty("CONTENT_LENGTH");
                if (cl != null) contentLen = Integer.parseInt(cl.trim());
            } catch (Exception ignored) {}

            String route = !scriptName.isEmpty() ? scriptName
                    : !pathInfo.isEmpty()   ? pathInfo
                    : requestUri; // например: /api/clear?ts=...

            String outJson;


            if (route.startsWith("/api/clear")) {
                if (!"POST".equalsIgnoreCase(method)) {
                    outJson = error("Method Not Allowed (use POST)");
                } else {
                    synchronized (HISTORY) { HISTORY.clear(); }
                    Map<String,Object> resp = new LinkedHashMap<>();
                    resp.put("ok", true);
                    resp.put("cleared", true);
                    resp.put("history", List.of());
                    outJson = json(resp);
                }


            } else if (route.startsWith("/api/check") || route.isEmpty())  {

                byte[] buf = new byte[Math.max(0, contentLen)];
                int read = 0;
                while (read < buf.length) {
                    int n = System.in.read(buf, read, buf.length - read);
                    if (n <= 0) break;
                    read += n;
                }
                String body = new String(buf, 0, read, StandardCharsets.UTF_8);


                System.err.printf("FCGI REQ: script=%s method=%s len=%d body=%s%n",
                        scriptName, method, contentLen, body);

                if (!"POST".equalsIgnoreCase(method)) {
                    outJson = error("Method Not Allowed (use POST)");
                } else if (!contentType.toLowerCase().contains("application/json")) {
                    outJson = error("Content-Type must be application/json");
                } else {
                    try {
                        Map<String, String> data = parseJsonBody(body);
                        double x = Double.parseDouble(data.get("x"));
                        double y = Double.parseDouble(data.get("y"));
                        double r = Double.parseDouble(data.get("r"));


                        if (x < -3 || x > 3)        outJson = error("X out of range [-3;3]");
                        else if (y < -3 || y > 5)   outJson = error("Y out of range {-3..5}");
                        else if (r < 1 || r > 4)    outJson = error("R out of range [1;4]");
                        else                        outJson = json(handle(x, y, r));
                    } catch (Exception e) {
                        outJson = error("Bad request: " + e.getMessage());
                    }
                }


            } else {
                outJson = error("Unknown endpoint: " + route);
            }


            System.out.write(headers);
            System.out.write(outJson.getBytes(StandardCharsets.UTF_8));
            System.out.flush();
            System.err.printf("FCGI REQ: route=%s method=%s len=%s%n",
                    route, method, Optional.ofNullable(props.getProperty("CONTENT_LENGTH")).orElse("-"));

        }
    }
}
