
class MeasureTool extends ToolEvt {
    //紀錄測量工具座標
    static Measure_Point1 = [0, 0];
    static Measure_Point2 = [0, 0];
    static previous_choose = null;

    onMouseDown(e) {
        let angle2point = rotateCalculation(e, true);
        MarkCollider.selected = null;
        if (!MouseDownCheck) return;

        MarkCollider.detect(rotateCalculation(e, true)[0], rotateCalculation(e, true)[1], "MeasureRuler");

        if (!MarkCollider.selected && MouseDownCheck) {
            var MeasureMark = new BlueLightMark();

            MeasureMark.setQRLevels(GetViewport().QRLevels);
            MeasureMark.color = "#FF0000";
            MeasureMark.hideName = MeasureMark.showName = "ruler";
            MeasureMark.type = "MeasureRuler";

            MeasureMark.colliders = [new MarkCollider(MeasureMark, angle2point[0], angle2point[1], 0), new MarkCollider(MeasureMark, angle2point[0], angle2point[1], 1)];
            MeasureMark.pointArray = [];
            MeasureMark.setPoint2D(angle2point[0], angle2point[1]);
            MeasureMark.setPoint2D(angle2point[0], angle2point[1]);
            MarkCollider.selected = MeasureMark.colliders[1];
            PatientMark.push(MeasureMark);
        }
        MeasureTool.Measure_Point1 = MeasureTool.Measure_Point2 = rotateCalculation(e, true);
        displayAllMark();
    }
    onMouseMove(e) {
        if (rightMouseDown) scale_size(e, originalPoint_X, originalPoint_Y);
        let angle2point = rotateCalculation(e, true);
        if (MouseDownCheck) {
            MeasureTool.Measure_Point2 = angle2point;
            if (MarkCollider.selected) {
                MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].x = angle2point[0];
                MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].y = angle2point[1];
                MarkCollider.selected.targetMark.colliders[MarkCollider.selected.parm] = new MarkCollider(MarkCollider.selected.targetMark, angle2point[0], angle2point[1], MarkCollider.selected.parm);
                refreshMark(MarkCollider.selected.targetMark);
            }
        }
    }
    onMouseUp(e) {
        let angle2point = rotateCalculation(e, true);
        MeasureTool.Measure_Point2 = angle2point;

        if (MarkCollider.selected) {
            MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].x = angle2point[0];
            MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].y = angle2point[1];
            refreshMark(MarkCollider.selected.targetMark);
            Mark_previous_choose = MarkCollider.selected.targetMark;
        }

        displayAllMark();
        if (rightMouseDown == true) displayMark();
        if (openLink) displayAllRuler();
    }
    onSwitch() {
        MarkCollider.selected = null;
        displayMark();
        Mark_previous_choose = null;
    }
    onTouchStart(e, e2) {
        MarkCollider.detect(rotateCalculation(e, true)[0], rotateCalculation(e, true)[1], "MeasureRuler");
        if (!MarkCollider.selected) {
            var MeasureMark = new BlueLightMark();

            MeasureMark.setQRLevels(GetViewport().QRLevels);
            MeasureMark.color = "#FF0000";
            MeasureMark.hideName = MeasureMark.showName = "ruler";
            MeasureMark.type = "MeasureRuler";

            MeasureMark.colliders = [new MarkCollider(MeasureMark, angle2point[0], angle2point[1], 0), new MarkCollider(MeasureMark, angle2point[0], angle2point[1], 1)];
            MeasureMark.pointArray = [];
            MeasureMark.setPoint2D(angle2point[0], angle2point[1]);
            MeasureMark.setPoint2D(angle2point[0], angle2point[1]);
            MarkCollider.selected = MeasureMark.colliders[1];
            PatientMark.push(MeasureMark);
        }
        MeasureTool.Measure_Point1 = MeasureTool.Measure_Point2 = rotateCalculation(e, true);
        displayAllMark();
    }
    onTouchMove(e, e2) {
        if (rightTouchDown) scale_size(e, originalPoint_X, originalPoint_Y);
        let angle2point = rotateCalculation(e, true);
        if (TouchDownCheck) {
            MeasureTool.Measure_Point2 = angle2point;
            if (MarkCollider.selected) {
                MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].x = angle2point[0];
                MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].y = angle2point[1];
                refreshMark(MarkCollider.selected.targetMark);
            }
        }
    }
    onTouchEnd(e, e2) {
        let angle2point = rotateCalculation(e, true);
        if (MarkCollider.selected) {
            MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].x = angle2point[0];
            MarkCollider.selected.targetMark.pointArray[MarkCollider.selected.parm].y = angle2point[1];
            refreshMark(MarkCollider.selected.targetMark);
            Mark_previous_choose = MarkCollider.selected.targetMark;
        }
        displayAllMark();

        if (rightMouseDown == true) displayMark();
        if (openLink) displayAllRuler();
    }
    onKeyDown(KeyboardKeys) {
        var key = KeyboardKeys.which;
        if (MarkCollider.selected && (key === 46 || key === 110)) {
            PatientMark.splice(PatientMark.indexOf(MarkCollider.selected.targetMark), 1);
            displayMark();
            MarkCollider.selected = null;
            refreshMarkFromSop(GetViewport().sop);
        }
    }
}

function measure() {
    cancelTools();
    toolEvt.onSwitch();
    toolEvt = new MeasureTool();
}

function drawMeasureRuler(obj) {
    try {
        var canvas = obj.canvas, Mark = obj.Mark, viewport = obj.viewport;
        if (!Mark) return;
        if (!Mark || Mark.type != "MeasureRuler" || Mark.pointArray.length < 2) return;
        var ctx = canvas.getContext("2d");

        var x1 = Mark.pointArray[0].x * 1, y1 = Mark.pointArray[0].y * 1;
        var x2 = Mark.pointArray[1].x * 1, y2 = Mark.pointArray[1].y * 1;
        if (Mark.RotationAngle && Mark.RotationPoint) {
            [x1, y1] = rotatePoint([x1, y1], Mark.RotationAngle, Mark.RotationPoint);
            [x2, y2] = rotatePoint([x2, y2], Mark.RotationAngle, Mark.RotationPoint);
        }
        viewport.drawLine(ctx, viewport, new Point2D(x1, y1), new Point2D(x2, y2), Mark.color, 1.0);

        viewport.fillCircle(ctx, viewport, Mark.pointArray[0], 3, "#00FF00", 1.0);
        viewport.fillCircle(ctx, viewport, Mark.lastMark, 3, "#00FF00", 1.0);

        if (Mark.pointArray[0] && Mark.pointArray[1]) {
            if (viewport.PixelSpacing) {
                var value = parseInt(Math.sqrt(
                    Math.pow(Mark.pointArray[0].x * viewport.PixelSpacing[0] - Mark.pointArray[1].x * viewport.PixelSpacing[0], 2) +
                    Math.pow(Mark.pointArray[0].y * viewport.PixelSpacing[1] - Mark.pointArray[1].y * viewport.PixelSpacing[1], 2), 2)) +
                    "mm";
                viewport.drawText(ctx, viewport, Mark.lastMark, value, 22, "#FF0000", alpha = 1.0);
            } else {
                var value = parseInt(Math.sqrt(
                    Math.pow(Mark.pointArray[0].x - Mark.pointArray[1].x, 2) +
                    Math.pow(Mark.pointArray[0].y - Mark.pointArray[1].y, 2), 2)) +
                    "px";
                viewport.drawText(ctx, viewport, Mark.lastMark, value, 22, "#FF0000", alpha = 1.0);
            }
        }
    } catch (ex) { console.log(ex) }
}
PLUGIN.PushMarkList(drawMeasureRuler);

onloadFunction.push2Last(function () {
    getByid("MeasureRuler").onclick = function () {
        if (this.enable == false) return;
        measure();
        drawBorder(getByid("openMeasureImg"));
        hideAllDrawer();
    }
});
